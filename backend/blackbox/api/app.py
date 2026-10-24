from __future__ import annotations

import hashlib
import json
from contextlib import asynccontextmanager
from typing import Any
from uuid import uuid4

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, ConfigDict, ValidationError
from sqlalchemy import desc, select

from blackbox.adapters.generic_jsonl import TraceFormatError, normalize_jsonl
from blackbox.db.base import Base, SessionLocal, engine
from blackbox.db.models import Investigation
from blackbox.engine.analyzer import analyze_record
from blackbox.normalizer.models import FlightRecord


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
