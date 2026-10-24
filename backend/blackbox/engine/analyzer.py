"""Deterministic MVP rule scan and evidence ledger for Flight Records."""

from __future__ import annotations

import hashlib
import json
import re
from typing import Any

from blackbox.normalizer.models import FlightRecord, Step

DESTRUCTIVE_TOOLS = {"cancel_order", "delete_order"}


def _canonical_hash(previous: str, fields: dict[str, Any]) -> str:
    canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256((previous + canonical).encode("utf-8")).hexdigest()


def _confirmation_exists(record: FlightRecord, step_index: int) -> bool:
    return any(
        step.actor == "user"
        and step.kind == "message"
        and step.index < step_index
        and isinstance(step.content, str)
        and re.search(r"\b(?:yes|confirm(?:ed)?|go\s+ahead)\b", step.content.casefold()) is not None
        for step in record.steps
    )


def _latest_order_status(record: FlightRecord, step_index: int) -> str | None:
    for step in reversed(record.steps):
        if step.index >= step_index or step.kind != "tool_result" or step.tool_result is None:
            continue
        if step.tool_result.tool != "get_order" or not isinstance(step.tool_result.output, dict):
            continue
        status = step.tool_result.output.get("status")
        return status.casefold() if isinstance(status, str) else None
    return None


def _excerpt(step: Step, limit: int = 1500) -> str:
    if step.content:
        return step.content[:limit]
    if step.tool_call:
        return json.dumps(step.tool_call.model_dump(), ensure_ascii=False, sort_keys=True)[:limit]
    if step.tool_result:
        return json.dumps(step.tool_result.model_dump(), ensure_ascii=False, sort_keys=True)[:limit]
    return json.dumps(step.model_dump(by_alias=True), ensure_ascii=False, sort_keys=True)[:limit]


def analyze_record(record: FlightRecord, *, trace_hash: str | None = None) -> dict[str, Any]:
    """Run the built-in retail checks and return a hash-chained evidence ledger."""
    findings: list[dict[str, Any]] = []
    for step in record.steps:
        if step.kind != "tool_call" or step.tool_call is None:
            continue

        tool_name = step.tool_call.tool
        if tool_name in DESTRUCTIVE_TOOLS and not _confirmation_exists(record, step.index):
            findings.append(
                {
                    "step_idx": step.index,
                    "check_id": "POL-CONFIRM-DELETE",
                    "title": "Destructive action needs prior user confirmation",
                    "severity": "critical",
                    "taxonomy": "BB-POL",
                    "observed": step.tool_call.model_dump(),
                    "expected": "An explicit user confirmation before the destructive action",
                    "message": f"{tool_name} was called without an earlier explicit user confirmation.",
                    "irreversible": True,
                    "excerpt": _excerpt(step),
                }
            )

        if tool_name == "cancel_order" and _latest_order_status(record, step.index) == "shipped":
            findings.append(
                {
                    "step_idx": step.index,
                    "check_id": "POL-NO-CANCEL-SHIPPED",
                    "title": "Do not cancel shipped orders",
                    "severity": "critical",
                    "taxonomy": "BB-POL",
                    "observed": {"tool_call": step.tool_call.model_dump(), "order_status": "shipped"},
                    "expected": "Order status other than shipped before cancellation",
                    "message": "cancel_order was called while the latest order status was shipped.",
                    "irreversible": True,
                    "excerpt": _excerpt(step),
                }
            )

    findings.sort(key=lambda item: (item["step_idx"], item["check_id"]))
    ledger: list[dict[str, Any]] = []
    previous_hash = "0" * 64
    for seq, finding in enumerate(findings):
        entry = {"seq": seq, **finding}
        fields = {
            key: entry[key]
            for key in (
                "seq",
                "step_idx",
                "check_id",
                "severity",
                "taxonomy",
                "observed",
                "expected",
                "message",
            )
        }
        entry["previous_hash"] = previous_hash
        entry["hash"] = _canonical_hash(previous_hash, fields)
        previous_hash = entry["hash"]
        ledger.append(entry)

    candidates = [entry for entry in ledger if entry["irreversible"]]
    pnr = min((entry["step_idx"] for entry in candidates), default=None)
    primary = next((entry for entry in candidates if entry["step_idx"] == pnr), None)
    return {
        "record": record.model_dump(mode="json", by_alias=True),
        "summary": {
            "step_count": len(record.steps),
            "violation_count": len(ledger),
            "pnr_step": pnr,
            "taxonomy_code": primary["taxonomy"] if primary else None,
            "basis": "rules" if primary else "no_rule_evidence",
            "first_violation_step": ledger[0]["step_idx"] if ledger else None,
            "trace_hash": trace_hash
            or hashlib.sha256(record.model_dump_json(by_alias=True).encode("utf-8")).hexdigest(),
        },
        "candidates": candidates,
        "ledger": ledger,
        "checks": ["POL-CONFIRM-DELETE", "POL-NO-CANCEL-SHIPPED"],
    }
