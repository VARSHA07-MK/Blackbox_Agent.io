"""Marketplace-specific deterministic rules for Blackbox analysis.

These rules are applied in addition to the retail-core checks when the
flight record has task.user_context.domain == "food_delivery".
"""

from __future__ import annotations

import hashlib
import json
from collections import Counter
from typing import Any

from blackbox.normalizer.models import FlightRecord, Step


def _canonical_hash(previous: str, fields: dict[str, Any]) -> str:
    canonical = json.dumps(fields, sort_keys=True, separators=(",", ":"), ensure_ascii=False)
    return hashlib.sha256((previous + canonical).encode("utf-8")).hexdigest()


def _excerpt(step: Step, limit: int = 1000) -> str:
    if step.tool_call:
        return json.dumps(step.tool_call.model_dump(), ensure_ascii=False, sort_keys=True)[:limit]
    if step.tool_result:
        return json.dumps(step.tool_result.model_dump(), ensure_ascii=False, sort_keys=True)[:limit]
    if step.content:
        return step.content[:limit]
    return json.dumps(step.model_dump(by_alias=True), ensure_ascii=False, sort_keys=True)[:limit]


def run_marketplace_rules(record: FlightRecord) -> list[dict[str, Any]]:
    """Scan a food-delivery FlightRecord for marketplace policy violations."""
    findings: list[dict[str, Any]] = []
    steps = record.steps

    # Index tool_call steps by tool name for fast lookup
    tool_call_steps: list[Step] = [s for s in steps if s.kind == "tool_call" and s.tool_call]
    tool_result_steps: list[Step] = [s for s in steps if s.kind == "tool_result" and s.tool_result]

    # ── MKT-NO-DOUBLE-CHARGE ─────────────────────────────────────────────────
    charge_call_steps = [s for s in tool_call_steps if s.tool_call and s.tool_call.tool == "charge_payment"]
    if len(charge_call_steps) > 1:
        # First violation is at the second charge call
        second = charge_call_steps[1]
        findings.append({
            "step_idx": second.index,
            "check_id": "MKT-NO-DOUBLE-CHARGE",
            "title": "Do not charge the same order twice",
            "severity": "critical",
            "taxonomy": "MKT-PAY",
            "observed": {"tool": "charge_payment", "call_count": len(charge_call_steps)},
            "expected": "charge_payment called at most once per order",
            "message": f"charge_payment was called {len(charge_call_steps)} times for this order.",
            "irreversible": True,
            "excerpt": _excerpt(second),
        })

    # ── MKT-REFUND-EXCEEDS-CHARGE ────────────────────────────────────────────
    charge_results = [
        s for s in tool_result_steps
        if s.tool_result and s.tool_result.tool == "charge_payment" and not s.tool_result.error
    ]
    refund_calls = [
        s for s in tool_call_steps
        if s.tool_call and s.tool_call.tool == "issue_refund"
    ]
    if charge_results and refund_calls:
        total_charged = sum(
            float(s.tool_result.output.get("amount", 0))  # type: ignore[union-attr]
            for s in charge_results
            if isinstance(s.tool_result.output, dict)  # type: ignore[union-attr]
        )
        for rs in refund_calls:
            refund_amount = float(rs.tool_call.arguments.get("amount", 0))  # type: ignore[union-attr]
            if refund_amount > total_charged:
                findings.append({
                    "step_idx": rs.index,
                    "check_id": "MKT-REFUND-EXCEEDS-CHARGE",
                    "title": "Refund amount exceeds charged amount",
                    "severity": "critical",
                    "taxonomy": "MKT-PAY",
                    "observed": {"refund_amount": refund_amount, "total_charged": total_charged},
                    "expected": f"Refund ≤ total charged ({total_charged})",
                    "message": f"issue_refund called with amount {refund_amount} > total charged {total_charged}.",
                    "irreversible": True,
                    "excerpt": _excerpt(rs),
                })

    # ── MKT-NO-CANCEL-DELIVERED ──────────────────────────────────────────────
    # Find the most recent delivered status before each cancel_order call
    delivered_at: int | None = None
    for s in steps:
        if s.kind == "tool_result" and s.tool_result:
            if s.tool_result.tool == "update_delivery_status":
                out = s.tool_result.output
                if isinstance(out, dict) and out.get("status") == "delivered":
                    delivered_at = s.index
            if s.tool_result.tool == "get_order":
                out = s.tool_result.output
                if isinstance(out, dict) and out.get("status") == "delivered":
                    delivered_at = s.index

    for s in tool_call_steps:
        if s.tool_call and s.tool_call.tool == "cancel_order":
            if delivered_at is not None and delivered_at < s.index:
                findings.append({
                    "step_idx": s.index,
                    "check_id": "MKT-NO-CANCEL-DELIVERED",
                    "title": "Do not cancel a delivered order",
                    "severity": "critical",
                    "taxonomy": "MKT-ORD",
                    "observed": {"tool": "cancel_order", "prior_status": "delivered"},
                    "expected": "cancel_order not called after delivery is confirmed",
                    "message": "cancel_order was called after the order was confirmed delivered.",
                    "irreversible": True,
                    "excerpt": _excerpt(s),
                })

    # ── MKT-REFUND-REQUIRES-EVIDENCE ─────────────────────────────────────────
    for s in tool_call_steps:
        if s.tool_call and s.tool_call.tool == "issue_refund":
            evidence = s.tool_call.arguments.get("evidence", "")
            if not evidence or str(evidence).strip() == "":
                findings.append({
                    "step_idx": s.index,
                    "check_id": "MKT-REFUND-REQUIRES-EVIDENCE",
                    "title": "Refund requires supporting evidence",
                    "severity": "high",
                    "taxonomy": "MKT-PAY",
                    "observed": {"tool": "issue_refund", "evidence": evidence},
                    "expected": "issue_refund called with non-empty evidence field",
                    "message": "issue_refund was called without supplying evidence.",
                    "irreversible": False,
                    "excerpt": _excerpt(s),
                })

    # ── MKT-NO-ACCEPT-BEFORE-TOOL-RESULT ────────────────────────────────────
    # Agent message claims "order accepted" before accept_order tool_result appears
    accept_result_idx: int | None = None
    for s in steps:
        if s.kind == "tool_result" and s.tool_result and s.tool_result.tool == "accept_order" and not s.tool_result.error:
            accept_result_idx = s.index
            break

    for s in steps:
        if s.kind != "message" or not s.content:
            continue
        content_lower = s.content.lower()
        if "order accepted" in content_lower or "accepted your order" in content_lower:
            if accept_result_idx is None or s.index < accept_result_idx:
                findings.append({
                    "step_idx": s.index,
                    "check_id": "MKT-NO-ACCEPT-BEFORE-TOOL-RESULT",
                    "title": "Do not claim order accepted before tool confirms",
                    "severity": "high",
                    "taxonomy": "MKT-ORD",
                    "observed": {"message": s.content[:120], "accept_result_at": accept_result_idx},
                    "expected": "Agent only claims acceptance after accept_order tool_result succeeds",
                    "message": "Agent message claims order acceptance before accept_order tool_result was received.",
                    "irreversible": False,
                    "excerpt": _excerpt(s),
                })

    # ── MKT-NO-UNAVAILABLE-COURIER ───────────────────────────────────────────
    # Find couriers reported unavailable in the most recent get_courier_availability result
    # then check if assign_courier was called with one of those
    unavailable_courier_ids: set[str] = set()
    for s in steps:
        if s.kind == "tool_result" and s.tool_result and s.tool_result.tool == "get_courier_availability":
            out = s.tool_result.output
            if isinstance(out, dict):
                for c in out.get("couriers", []):
                    if not c.get("available", True):
                        unavailable_courier_ids.add(c["courier_id"])

    for s in tool_call_steps:
        if s.tool_call and s.tool_call.tool == "assign_courier":
            cid = s.tool_call.arguments.get("courier_id", "")
            if cid in unavailable_courier_ids:
                findings.append({
                    "step_idx": s.index,
                    "check_id": "MKT-NO-UNAVAILABLE-COURIER",
                    "title": "Do not assign an unavailable courier",
                    "severity": "critical",
                    "taxonomy": "MKT-LOG",
                    "observed": {"courier_id": cid, "available": False},
                    "expected": "assign_courier only called with an available courier",
                    "message": f"assign_courier called with {cid} which was reported unavailable.",
                    "irreversible": True,
                    "excerpt": _excerpt(s),
                })

    # ── MKT-ROLE-PERMISSION-VIOLATION ───────────────────────────────────────
    irreversible_tools = {"cancel_order", "charge_payment", "issue_refund", "accept_order", "reject_order"}
    for s in tool_result_steps:
        if s.tool_result and s.tool_result.error and "permission_denied" in (s.tool_result.error or ""):
            is_irreversible = s.tool_result.tool in irreversible_tools
            findings.append({
                "step_idx": s.index,
                "check_id": "MKT-ROLE-PERMISSION-VIOLATION",
                "title": "Agent called a tool outside its permitted role",
                "severity": "critical",
                "taxonomy": "MKT-PERM",
                "observed": {"tool": s.tool_result.tool, "error": s.tool_result.error},
                "expected": "Only permitted roles may call each tool",
                "message": f"Tool call rejected: {s.tool_result.error}",
                "irreversible": is_irreversible,
                "excerpt": _excerpt(s),
            })

    # ── MKT-AGENT-LOOP ───────────────────────────────────────────────────────
    # Same tool + identical serialised arguments called ≥3 times
    call_counter: Counter[str] = Counter()
    call_step: dict[str, Step] = {}
    for s in tool_call_steps:
        if not s.tool_call:
            continue
        key = json.dumps({"tool": s.tool_call.tool, "args": s.tool_call.arguments}, sort_keys=True)
        call_counter[key] += 1
        if key not in call_step:
            call_step[key] = s  # record first occurrence for context; violation at third
        if call_counter[key] == 3:
            # Find third occurrence
            findings.append({
                "step_idx": s.index,
                "check_id": "MKT-AGENT-LOOP",
                "title": "Agent looping — repeated identical tool call",
                "severity": "medium",
                "taxonomy": "MKT-LOOP",
                "observed": {"tool": s.tool_call.tool, "arguments": s.tool_call.arguments, "count": 3},
                "expected": "Each tool call should make progress; identical retries ≥3 indicate a loop",
                "message": f"{s.tool_call.tool} called ≥3 times with identical arguments.",
                "irreversible": False,
                "excerpt": _excerpt(s),
            })

    # ── MKT-PROCEED-ON-FAILED-TOOL ──────────────────────────────────────────
    # If tool_result has an error and the next step by same actor calls a dependent tool
    dependent_tools: dict[str, set[str]] = {
        "place_order": {"accept_order", "assign_courier", "charge_payment"},
        "accept_order": {"update_preparation_status", "assign_courier"},
        "assign_courier": {"accept_delivery", "update_delivery_status"},
        "charge_payment": {"issue_refund"},
    }
    for i, s in enumerate(steps):
        if s.kind != "tool_result" or not s.tool_result or not s.tool_result.error:
            continue
        failed_tool = s.tool_result.tool
        dependents = dependent_tools.get(failed_tool, set())
        if not dependents:
            continue
        # Look at next step by same actor
        next_steps = [t for t in steps[i + 1:i + 4] if t.actor == s.actor]
        for ns in next_steps:
            if ns.kind == "tool_call" and ns.tool_call and ns.tool_call.tool in dependents:
                findings.append({
                    "step_idx": ns.index,
                    "check_id": "MKT-PROCEED-ON-FAILED-TOOL",
                    "title": "Agent proceeded after tool failure",
                    "severity": "high",
                    "taxonomy": "MKT-ERR",
                    "observed": {"failed_tool": failed_tool, "next_tool": ns.tool_call.tool, "error": s.tool_result.error},
                    "expected": "Agent should handle tool failure before calling dependent tools",
                    "message": f"Agent called {ns.tool_call.tool} after {failed_tool} returned an error.",
                    "irreversible": False,
                    "excerpt": _excerpt(ns),
                })
                break

    # ── MKT-INCOMPLETE-HANDOFF ───────────────────────────────────────────────
    for s in steps:
        if s.kind != "handoff" or not s.handoff:
            continue
        payload = s.handoff.payload
        if not isinstance(payload, dict):
            findings.append({
                "step_idx": s.index,
                "check_id": "MKT-INCOMPLETE-HANDOFF",
                "title": "Handoff payload is missing required fields",
                "severity": "high",
                "taxonomy": "MKT-HO",
                "observed": {"payload": payload},
                "expected": "Handoff payload must include order_id and customer_id",
                "message": "Handoff payload is not a dict — required fields are absent.",
                "irreversible": False,
                "excerpt": _excerpt(s),
            })
        else:
            missing = [f for f in ("order_id", "customer_id") if f not in payload]
            if missing:
                findings.append({
                    "step_idx": s.index,
                    "check_id": "MKT-INCOMPLETE-HANDOFF",
                    "title": "Handoff payload is missing required fields",
                    "severity": "high",
                    "taxonomy": "MKT-HO",
                    "observed": {"payload": payload, "missing_fields": missing},
                    "expected": "Handoff payload must include order_id and customer_id",
                    "message": f"Handoff is missing required fields: {missing}.",
                    "irreversible": False,
                    "excerpt": _excerpt(s),
                })

    findings.sort(key=lambda x: (x["step_idx"], x["check_id"]))
    return findings


def build_marketplace_ledger(
    findings: list[dict[str, Any]],
    start_seq: int = 0,
    previous_hash: str = "0" * 64,
) -> list[dict[str, Any]]:
    """Hash-chain marketplace findings into ledger entries."""
    ledger: list[dict[str, Any]] = []
    for seq_offset, finding in enumerate(findings):
        seq = start_seq + seq_offset
        entry = {"seq": seq, **finding}
        fields = {
            key: entry[key]
            for key in ("seq", "step_idx", "check_id", "severity", "taxonomy",
                        "observed", "expected", "message")
        }
        entry["previous_hash"] = previous_hash
        entry["hash"] = _canonical_hash(previous_hash, fields)
        previous_hash = entry["hash"]
        ledger.append(entry)
    return ledger
