"""Convert SimRun events into FlightRecords compatible with the Blackbox analyzer."""

from __future__ import annotations

from typing import Any

from blackbox.normalizer.models import (
    Agent,
    FlightRecord,
    Handoff,
    Step,
    Task,
    Tool,
    ToolCall,
    ToolResult,
)
from blackbox.simulation.runner import SimEvent, SimRun


def _step_from_event(index: int, ev: SimEvent) -> Step | None:
    """Convert one SimEvent into a normalizer Step. Returns None for unsupported types."""
    kind = ev.event_type
    payload = ev.payload

    if kind == "message":
        return Step(
            index=index,
            actor=ev.agent_id,
            kind="message",
            content=payload.get("content", ""),
            ts=ev.ts,
            meta={"role": ev.role, "order_id": ev.order_id, "scenario_id": ev.scenario_id},
        )

    if kind == "tool_call":
        return Step(
            index=index,
            actor=ev.agent_id,
            kind="tool_call",
            tool_call=ToolCall(
                tool=payload.get("tool", "unknown"),
                arguments=payload.get("arguments", {}),
            ),
            ts=ev.ts,
            meta={"role": ev.role, "order_id": ev.order_id, "scenario_id": ev.scenario_id},
        )

    if kind == "tool_result":
        return Step(
            index=index,
            actor=ev.agent_id,
            kind="tool_result",
            tool_result=ToolResult(
                tool=payload.get("tool", "unknown"),
                output=payload.get("output"),
                error=payload.get("error"),
            ),
            ts=ev.ts,
            meta={"role": ev.role, "order_id": ev.order_id, "scenario_id": ev.scenario_id},
        )

    if kind == "handoff":
        return Step(
            index=index,
            actor=ev.agent_id,
            kind="handoff",
            handoff=Handoff(
                **{"from": ev.agent_id, "to": payload.get("to", "unknown")},
                payload=payload.get("payload"),
            ),
            ts=ev.ts,
            meta={"role": ev.role, "order_id": ev.order_id, "scenario_id": ev.scenario_id},
        )

    if kind == "decision":
        return Step(
            index=index,
            actor=ev.agent_id,
            kind="decision",
            content=f"[DECISION] {payload.get('reasoning', '')} → {payload.get('chosen', '')}",
            ts=ev.ts,
            meta={"role": ev.role, "order_id": ev.order_id, "scenario_id": ev.scenario_id},
        )

    if kind == "system_event":
        return Step(
            index=index,
            actor=ev.agent_id,
            kind="system_event",
            content=str(payload),
            ts=ev.ts,
            meta={"role": ev.role, "order_id": ev.order_id, "scenario_id": ev.scenario_id},
        )

    return None


def build_flight_record_for_order(run: SimRun, order_id: str) -> FlightRecord | None:
    """Build a FlightRecord for all events belonging to one order."""
    order_events = [e for e in run.events if e.order_id == order_id]
    if not order_events:
        return None

    # Determine scenario_id from events
    scenario_id = next((e.scenario_id for e in order_events if e.scenario_id), "normal_completion")

    # Build steps, filtering out None
    steps: list[Step] = []
    for idx, ev in enumerate(order_events):
        step = _step_from_event(idx, ev)
        if step is not None:
            steps.append(step)

    if not steps:
        return None

    # Re-index to ensure sequential
    reindexed = [
        Step(**{**s.model_dump(by_alias=True), "index": i})
        for i, s in enumerate(steps)
    ]

    # Unique agents in this order
    seen_agents: dict[str, str] = {}
    for ev in order_events:
        if ev.agent_id not in seen_agents:
            seen_agents[ev.agent_id] = ev.role
    agents = [Agent(agent_id=aid, role=role) for aid, role in seen_agents.items()]

    # Tools referenced
    tool_names: set[str] = set()
    for ev in order_events:
        if ev.event_type in ("tool_call", "tool_result"):
            tn = ev.payload.get("tool")
            if tn:
                tool_names.add(tn)
    tools = [Tool(name=tn, mutating=tn not in ("search_restaurants", "get_menu", "get_order",
                                                "get_courier_availability", "get_platform_metrics"))
             for tn in sorted(tool_names)]

    record_id = f"sim-{run.run_id[:8]}-order-{order_id}"
    task = Task(
        goal=f"Complete food delivery order {order_id}",
        constraints=[
            "Do not charge the same order twice",
            "Do not cancel a delivered order",
            "Do not issue a refund without evidence",
            "Respect role permissions",
        ],
        user_context={
            "run_id": run.run_id,
            "seed": run.seed,
            "scenario_id": scenario_id,
            "domain": "food_delivery",
        },
    )

    return FlightRecord(
        record_id=record_id,
        schema_version="1",
        source_format="simulation",
        task=task,
        agents=agents,
        tools=tools,
        steps=reindexed,
    )


def build_all_flight_records(run: SimRun) -> dict[str, FlightRecord]:
    """Build FlightRecords for all orders in the run."""
    order_ids = sorted({e.order_id for e in run.events if e.order_id})
    result: dict[str, FlightRecord] = {}
    for oid in order_ids:
        fr = build_flight_record_for_order(run, oid)
        if fr:
            result[oid] = fr
    return result
