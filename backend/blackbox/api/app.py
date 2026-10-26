from __future__ import annotations

import hashlib
import json
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import desc, select

from blackbox.adapters.generic_jsonl import TraceFormatError, normalize_jsonl
from blackbox.adoption.coordinator import (
    build_dashboard_metrics,
    get_enrollment_checklist,
    merge_registry_with_enrollment,
)
from blackbox.adoption.models import EnrollRequest, TriggerConfig, ValidateSampleRequest
from blackbox.adoption.registry import get_demo_agent
from blackbox.db.base import Base, SessionLocal, engine
from blackbox.db.models import EnrolledAgent, Investigation, SimulationRun
from blackbox.engine.analyzer import analyze_record
from blackbox.normalizer.models import FlightRecord
from blackbox.simulation.runner import DEFAULT_AGENT_COUNTS, run_simulation
from blackbox.simulation.scenarios import SCENARIOS
from blackbox.simulation.trace_gen import build_all_flight_records


@asynccontextmanager
async def lifespan(app: FastAPI):  # type: ignore[type-arg]
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield


app = FastAPI(title="Blackbox for Agents", version="0.2.0", lifespan=lifespan)


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source_format: str = "generic-jsonl"
    trace: str | dict[str, Any]
    task: dict[str, Any] | None = None
    record_id: str | None = None


@app.get("/healthz")
def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/v1/rulebooks")
def list_rulebooks() -> dict[str, list[dict[str, str]]]:
    return {
        "rulebooks": [
            {"name": "retail-core", "version": "1.2.0", "checks": "2 built-in checks"}
        ]
    }


@app.post("/v1/analyze")
async def analyze(request: AnalyzeRequest) -> dict[str, Any]:
    try:
        if request.source_format == "generic-jsonl":
            if not isinstance(request.trace, str):
                raise HTTPException(
                    422,
                    detail={"path": "trace", "message": "Expected JSONL text."},
                )
            record = normalize_jsonl(
                request.trace,
                task=request.task,
                record_id=request.record_id,
            )
            raw_payload = request.trace.encode("utf-8")
        elif request.source_format == "flight-record-1":
            if not isinstance(request.trace, dict):
                raise HTTPException(
                    422,
                    detail={"path": "trace", "message": "Expected a Flight Record object."},
                )
            record = FlightRecord.model_validate(request.trace)
            raw_payload = json.dumps(
                request.trace,
                sort_keys=True,
                separators=(",", ":"),
                ensure_ascii=False,
            ).encode("utf-8")
        else:
            raise HTTPException(
                422,
                detail={"path": "source_format", "message": "Use generic-jsonl or flight-record-1."},
            )
    except TraceFormatError as exc:
        raise HTTPException(422, detail={"path": exc.path, "message": exc.message}) from exc
    except ValidationError as exc:
        error = exc.errors(include_url=False)[0]
        path = ".".join(str(part) for part in error["loc"])
        raise HTTPException(
            422,
            detail={"path": f"trace.{path}" if path else "trace", "message": error["msg"]},
        ) from exc

    trace_hash = hashlib.sha256(raw_payload).hexdigest()
    result = analyze_record(record, trace_hash=trace_hash)
    investigation_id = str(uuid4())

    async with SessionLocal() as session:
        inv = Investigation(
            id=investigation_id,
            record_id=record.record_id,
            task_goal=record.task.goal,
            step_count=result["summary"]["step_count"],
            violation_count=result["summary"]["violation_count"],
            pnr_step=result["summary"]["pnr_step"],
            taxonomy_code=result["summary"]["taxonomy_code"],
            basis=result["summary"]["basis"],
            trace_hash=result["summary"]["trace_hash"],
            result_json=result,
        )
        session.add(inv)
        await session.commit()

    return {"investigation_id": investigation_id, **result}


@app.get("/v1/investigations")
async def list_investigations_endpoint() -> dict[str, Any]:
    async with SessionLocal() as session:
        rows = await session.execute(
            select(Investigation).order_by(desc(Investigation.created_at)).limit(50)
        )
        investigations = rows.scalars().all()
    return {
        "investigations": [
            {
                "id": inv.id,
                "created_at": inv.created_at.isoformat(),
                "record_id": inv.record_id,
                "task_goal": inv.task_goal,
                "step_count": inv.step_count,
                "violation_count": inv.violation_count,
                "pnr_step": inv.pnr_step,
                "taxonomy_code": inv.taxonomy_code,
                "basis": inv.basis,
                "trace_hash": inv.trace_hash,
            }
            for inv in investigations
        ]
    }


@app.get("/v1/investigations/{investigation_id}")
async def get_investigation_endpoint(investigation_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        inv = await session.get(Investigation, investigation_id)
    if inv is None:
        raise HTTPException(
            404,
            detail={"message": f"Investigation {investigation_id} not found"},
        )
    return {
        "id": inv.id,
        "created_at": inv.created_at.isoformat(),
        **inv.result_json,
    }


# ── Simulation routes ─────────────────────────────────────────────────────────

class SimulationRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    seed: int | None = None
    agent_counts: dict[str, int] | None = None
    scenario_mix: list[str] | None = None
    num_orders: int = 20


@app.get("/v1/simulations/scenarios")
def list_scenarios() -> dict[str, Any]:
    return {
        "scenarios": [
            {
                "scenario_id": s.scenario_id,
                "name": s.name,
                "description": s.description,
                "inject_at_order": s.inject_at_order,
            }
            for s in SCENARIOS
        ]
    }


@app.post("/v1/simulations")
async def start_simulation(request: SimulationRequest) -> dict[str, Any]:
    import time as _time
    seed = request.seed if request.seed is not None else int(_time.time() * 1000) % 100000
    agent_counts = {**DEFAULT_AGENT_COUNTS, **(request.agent_counts or {})}
    scenario_mix = request.scenario_mix or [s.scenario_id for s in SCENARIOS if s.scenario_id != "normal_completion"]

    sim_run = run_simulation(
        seed=seed,
        agent_counts=agent_counts,
        scenario_mix=scenario_mix,
        num_orders=request.num_orders,
    )

    # Analyze per-order traces
    flight_records = build_all_flight_records(sim_run)
    per_order: dict[str, Any] = {}
    investigation_ids: dict[str, str] = {}

    for order_id, fr in flight_records.items():
        raw = fr.model_dump_json(by_alias=True).encode("utf-8")
        trace_hash = hashlib.sha256(raw).hexdigest()
        result = analyze_record(fr, trace_hash=trace_hash)
        inv_id = str(uuid4())
        investigation_ids[order_id] = inv_id
        per_order[order_id] = {
            "investigation_id": inv_id,
            "violation_count": result["summary"]["violation_count"],
            "pnr_step": result["summary"]["pnr_step"],
            "step_count": result["summary"]["step_count"],
            "scenario_id": fr.task.user_context.get("scenario_id", "normal_completion"),
            "trace_hash": trace_hash,
            "analysis": result,
        }

        async with SessionLocal() as session:
            inv = Investigation(
                id=inv_id,
                record_id=fr.record_id,
                task_goal=fr.task.goal,
                step_count=result["summary"]["step_count"],
                violation_count=result["summary"]["violation_count"],
                pnr_step=result["summary"]["pnr_step"],
                taxonomy_code=result["summary"]["taxonomy_code"],
                basis=result["summary"]["basis"],
                trace_hash=trace_hash,
                result_json={**result, "simulation_run_id": sim_run.run_id},
            )
            session.add(inv)
            await session.commit()

    sim_run.metrics["per_order"] = {
        oid: {k: v for k, v in data.items() if k != "analysis"}
        for oid, data in per_order.items()
    }
    sim_run.metrics["total_violations"] = sum(d["violation_count"] for d in per_order.values())
    sim_run.metrics["orders_with_pnr"] = sum(1 for d in per_order.values() if d["pnr_step"] is not None)

    events_serialized = [
        {
            "event_id": e.event_id,
            "run_id": e.run_id,
            "ts": e.ts,
            "agent_id": e.agent_id,
            "role": e.role,
            "event_type": e.event_type,
            "payload": e.payload,
            "order_id": e.order_id,
            "scenario_id": e.scenario_id,
        }
        for e in sim_run.events
    ]

    async with SessionLocal() as session:
        db_run = SimulationRun(
            id=sim_run.run_id,
            seed=sim_run.seed,
            agent_counts=sim_run.agent_counts,
            scenario_mix=sim_run.scenario_mix,
            num_orders=request.num_orders,
            status=sim_run.status,
            started_at=sim_run.started_at,
            completed_at=sim_run.completed_at,
            metrics=sim_run.metrics,
            events_json=events_serialized,
        )
        session.add(db_run)
        await session.commit()

    return {
        "run_id": sim_run.run_id,
        "seed": sim_run.seed,
        "agent_counts": sim_run.agent_counts,
        "scenario_mix": sim_run.scenario_mix,
        "num_orders": request.num_orders,
        "status": sim_run.status,
        "started_at": sim_run.started_at,
        "completed_at": sim_run.completed_at,
        "metrics": sim_run.metrics,
        "total_events": len(sim_run.events),
        "events": events_serialized,
    }


@app.get("/v1/simulations")
async def list_simulations() -> dict[str, Any]:
    async with SessionLocal() as session:
        rows = await session.execute(
            select(SimulationRun).order_by(desc(SimulationRun.created_at)).limit(50)
        )
        runs = rows.scalars().all()
    return {
        "simulations": [
            {
                "run_id": r.id,
                "created_at": r.created_at.isoformat(),
                "seed": r.seed,
                "num_orders": r.num_orders,
                "status": r.status,
                "started_at": r.started_at,
                "completed_at": r.completed_at,
                "metrics": r.metrics,
                "scenario_mix": r.scenario_mix,
                "agent_counts": r.agent_counts,
            }
            for r in runs
        ]
    }


@app.get("/v1/simulations/{run_id}")
async def get_simulation(run_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        run = await session.get(SimulationRun, run_id)
    if run is None:
        raise HTTPException(404, detail={"message": f"Simulation {run_id} not found"})
    return {
        "run_id": run.id,
        "created_at": run.created_at.isoformat(),
        "seed": run.seed,
        "num_orders": run.num_orders,
        "agent_counts": run.agent_counts,
        "scenario_mix": run.scenario_mix,
        "status": run.status,
        "started_at": run.started_at,
        "completed_at": run.completed_at,
        "metrics": run.metrics,
        "total_events": len(run.events_json),
        "events": run.events_json,
    }


@app.get("/v1/simulations/{run_id}/orders")
async def get_simulation_orders(run_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        run = await session.get(SimulationRun, run_id)
    if run is None:
        raise HTTPException(404, detail={"message": f"Simulation {run_id} not found"})
    per_order = run.metrics.get("per_order", {})
    return {"run_id": run_id, "orders": per_order}


@app.get("/v1/simulations/{run_id}/export")
async def export_simulation(run_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        run = await session.get(SimulationRun, run_id)
    if run is None:
        raise HTTPException(404, detail={"message": f"Simulation {run_id} not found"})
    return {
        "exported_at": datetime.now(timezone.utc).isoformat(),
        "run_id": run.id,
        "seed": run.seed,
        "num_orders": run.num_orders,
        "agent_counts": run.agent_counts,
        "scenario_mix": run.scenario_mix,
        "metrics": run.metrics,
        "events": run.events_json,
    }


# ── Adoption coordinator routes ───────────────────────────────────────────────

@app.get("/v1/adoption/agents")
async def list_adoption_agents() -> dict[str, Any]:
    async with SessionLocal() as session:
        rows = await session.execute(select(EnrolledAgent))
        enrolled_list = rows.scalars().all()
    enrolled_map = {e.agent_id: e for e in enrolled_list}
    agents = merge_registry_with_enrollment(enrolled_map)
    return {"agents": agents, "registry_note": "SIMULATED DEMO REGISTRY — synthetic agents only"}


@app.post("/v1/adoption/agents/{agent_id}/enroll")
async def enroll_agent(agent_id: str, request: EnrollRequest) -> dict[str, Any]:
    demo = get_demo_agent(agent_id)
    if demo is None:
        raise HTTPException(404, detail={"message": f"Agent {agent_id} not found in registry"})

    async with SessionLocal() as session:
        existing = await session.get(EnrolledAgent, agent_id)
        now = datetime.now(timezone.utc).isoformat()
        if existing:
            existing.status = "setup_needed"
            existing.rulebook = request.rulebook
            existing.notes = request.notes
            existing.enrolled_at = now
        else:
            ea = EnrolledAgent(
                agent_id=agent_id,
                agent_name=demo["agent_name"],
                application=demo["application"],
                owner_email=demo["owner_email"],
                environment=demo["environment"],
                trace_format=demo["trace_format"],
                status="setup_needed",
                rulebook=request.rulebook,
                notes=request.notes,
                enrolled_at=now,
                triggers=[],
            )
            session.add(ea)
        await session.commit()

    checklist = get_enrollment_checklist(agent_id)
    return {
        "agent_id": agent_id,
        "status": "setup_needed",
        "requires_approval": True,
        "message": "Agent enrolled. Owner approval required before production triggers are enabled.",
        "enrollment_checklist": checklist,
        "next_step": checklist[1],
    }


@app.post("/v1/adoption/agents/{agent_id}/pause")
async def pause_agent(agent_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        ea = await session.get(EnrolledAgent, agent_id)
        if not ea:
            raise HTTPException(404, detail={"message": f"Agent {agent_id} not enrolled"})
        ea.status = "paused"
        await session.commit()
    return {"agent_id": agent_id, "status": "paused"}


@app.delete("/v1/adoption/agents/{agent_id}")
async def unenroll_agent(agent_id: str) -> dict[str, Any]:
    async with SessionLocal() as session:
        ea = await session.get(EnrolledAgent, agent_id)
        if not ea:
            raise HTTPException(404, detail={"message": f"Agent {agent_id} not enrolled"})
        await session.delete(ea)
        await session.commit()
    return {"agent_id": agent_id, "status": "not_enrolled", "message": "Agent removed from Blackbox enrollment."}


@app.post("/v1/adoption/agents/{agent_id}/validate-sample")
async def validate_sample(agent_id: str, request: ValidateSampleRequest) -> dict[str, Any]:
    async with SessionLocal() as session:
        ea = await session.get(EnrolledAgent, agent_id)
        if not ea:
            raise HTTPException(404, detail={"message": f"Agent {agent_id} not enrolled. Enroll first."})

    # Validate and analyze
    try:
        if request.source_format == "generic-jsonl":
            record = normalize_jsonl(request.trace)
            raw_payload = request.trace.encode("utf-8")
        elif request.source_format == "flight-record-1":
            parsed = json.loads(request.trace)
            record = FlightRecord.model_validate(parsed)
            raw_payload = json.dumps(parsed, sort_keys=True, separators=(",", ":")).encode("utf-8")
        else:
            raise HTTPException(422, detail={"path": "source_format", "message": "Use generic-jsonl or flight-record-1."})
    except TraceFormatError as exc:
        return {
            "agent_id": agent_id,
            "valid": False,
            "errors": [{"path": exc.path, "message": exc.message}],
        }
    except ValidationError as exc:
        errors = [{"path": str(e["loc"]), "message": e["msg"]} for e in exc.errors(include_url=False)]
        return {"agent_id": agent_id, "valid": False, "errors": errors}

    trace_hash = hashlib.sha256(raw_payload).hexdigest()
    result = analyze_record(record, trace_hash=trace_hash)
    investigation_id = str(uuid4())
    now = datetime.now(timezone.utc).isoformat()

    async with SessionLocal() as session:
        inv = Investigation(
            id=investigation_id,
            record_id=record.record_id,
            task_goal=record.task.goal,
            step_count=result["summary"]["step_count"],
            violation_count=result["summary"]["violation_count"],
            pnr_step=result["summary"]["pnr_step"],
            taxonomy_code=result["summary"]["taxonomy_code"],
            basis=result["summary"]["basis"],
            trace_hash=trace_hash,
            result_json={**result, "adoption_agent_id": agent_id},
        )
        session.add(inv)

        ea = await session.get(EnrolledAgent, agent_id)
        if ea:
            ea.status = "sample_passed"
            ea.last_analyzed_at = now
            ea.analysis_count = (ea.analysis_count or 0) + 1
            ea.violation_count = (ea.violation_count or 0) + result["summary"]["violation_count"]
            if result["summary"]["pnr_step"] is not None:
                ea.pnr_count = (ea.pnr_count or 0) + 1
        await session.commit()

    return {
        "agent_id": agent_id,
        "valid": True,
        "investigation_id": investigation_id,
        "summary": result["summary"],
        "status": "sample_passed",
        "message": "Sample trace validated. Review the investigation then enable triggers.",
    }


@app.post("/v1/adoption/agents/{agent_id}/triggers")
async def add_trigger(agent_id: str, trigger: TriggerConfig) -> dict[str, Any]:
    async with SessionLocal() as session:
        ea = await session.get(EnrolledAgent, agent_id)
        if not ea:
            raise HTTPException(404, detail={"message": f"Agent {agent_id} not enrolled"})
        triggers = list(ea.triggers or [])
        triggers.append(trigger.model_dump())
        ea.triggers = triggers
        if ea.status == "sample_passed":
            ea.status = "active"
        await session.commit()
    return {
        "agent_id": agent_id,
        "status": ea.status,
        "requires_approval": True,
        "message": "Trigger added. Production trigger activation requires owner approval.",
        "triggers": ea.triggers,
    }


@app.get("/v1/adoption/dashboard")
async def adoption_dashboard() -> dict[str, Any]:
    async with SessionLocal() as session:
        rows = await session.execute(select(EnrolledAgent))
        enrolled_list = rows.scalars().all()
    enrolled_map = {e.agent_id: e for e in enrolled_list}
    agents = merge_registry_with_enrollment(enrolled_map)
    metrics = build_dashboard_metrics(agents)
    return {
        "metrics": metrics,
        "registry_note": "SIMULATED DEMO REGISTRY — synthetic agents only",
        "disclaimer": "Connecting real internal agents requires an approved registry and explicit owner enrollment.",
    }
