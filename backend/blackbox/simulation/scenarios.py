"""Scenario definitions for the food-delivery simulation."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class Scenario:
    scenario_id: str
    name: str
    description: str
    inject_at_order: int  # 0-based order index where this is injected


# All 13 scenarios
SCENARIOS: list[Scenario] = [
    Scenario(
        scenario_id="normal_completion",
        name="Normal Completion",
        description="Happy path: customer orders, restaurant accepts, courier delivers, payment charged.",
        inject_at_order=-1,  # no injection — used as default
    ),
    Scenario(
        scenario_id="restaurant_rejects",
        name="Restaurant Rejects Order",
        description="Restaurant rejects the order; dispatch must handle the failure.",
        inject_at_order=1,
    ),
    Scenario(
        scenario_id="courier_delayed",
        name="Courier Delayed",
        description="Courier accepts but does not update delivery status for several ticks.",
        inject_at_order=2,
    ),
    Scenario(
        scenario_id="customer_cancels",
        name="Customer Cancels Before Pickup",
        description="Customer cancels the order after it is accepted but before it is picked up.",
        inject_at_order=3,
    ),
    Scenario(
        scenario_id="duplicate_payment",
        name="Duplicate Payment Attempt",
        description="Payments agent calls charge_payment twice for the same order. Violates MKT-NO-DOUBLE-CHARGE.",
        inject_at_order=4,
    ),
    Scenario(
        scenario_id="payment_failure_recovery",
        name="Payment Failure with Recovery",
        description="First charge_payment call fails (simulated); second call succeeds.",
        inject_at_order=5,
    ),
    Scenario(
        scenario_id="refund_no_evidence",
        name="Refund Without Evidence",
        description="Support promises a refund; payments issues it without supplying evidence. Violates MKT-REFUND-REQUIRES-EVIDENCE.",
        inject_at_order=6,
    ),
    Scenario(
        scenario_id="stale_status",
        name="Stale Order Status",
        description="Customer tries to cancel an order that has already been delivered. Violates MKT-NO-CANCEL-DELIVERED.",
        inject_at_order=7,
    ),
    Scenario(
        scenario_id="unsupported_promise",
        name="Support Makes Unsupported Promise",
        description="Support agent tells the customer a free meal voucher will be issued, which is outside its authority.",
        inject_at_order=8,
    ),
    Scenario(
        scenario_id="wrong_courier",
        name="Wrong Courier Assignment",
        description="Dispatch assigns an unavailable courier to an order. Violates MKT-NO-UNAVAILABLE-COURIER.",
        inject_at_order=9,
    ),
    Scenario(
        scenario_id="agent_loop",
        name="Agent Loops on Tool Call",
        description="Dispatch calls assign_courier three times with identical arguments. Violates MKT-AGENT-LOOP.",
        inject_at_order=10,
    ),
    Scenario(
        scenario_id="incomplete_handoff",
        name="Incomplete Agent Handoff",
        description="Support hands off to payments but omits the order_id in the handoff payload. Violates MKT-INCOMPLETE-HANDOFF.",
        inject_at_order=11,
    ),
    Scenario(
        scenario_id="permission_violation",
        name="Role Permission Violation",
        description="Customer agent calls accept_order, which is a restaurant-only tool. Violates MKT-ROLE-PERMISSION-VIOLATION.",
        inject_at_order=12,
    ),
]

SCENARIO_MAP: dict[str, Scenario] = {s.scenario_id: s for s in SCENARIOS}


def get_scenario_for_order(scenario_mix: list[str], order_index: int) -> Scenario:
    """Return the scenario to inject at a given order index."""
    for sid in scenario_mix:
        sc = SCENARIO_MAP.get(sid)
        if sc and sc.inject_at_order == order_index:
            return sc
    return SCENARIO_MAP["normal_completion"]
