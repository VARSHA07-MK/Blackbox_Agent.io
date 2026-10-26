"""Synchronous, seed-deterministic simulation runner.

Processes num_orders food-delivery orders in sequence. Each order runs through
a deterministic agent workflow; anomalies are injected according to the
scenario mix. All randomness uses a single seeded random.Random instance so
the same (seed, config, num_orders) always produces identical output.
"""

from __future__ import annotations

import random
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

from blackbox.simulation.marketplace import MarketplaceState, build_initial_state
from blackbox.simulation.scenarios import SCENARIO_MAP, Scenario, get_scenario_for_order
from blackbox.simulation.tools import call_tool

DEFAULT_AGENT_COUNTS: dict[str, int] = {
    "customer": 60,
    "restaurant": 15,
    "courier": 15,
    "dispatch": 3,
    "support": 3,
    "payments": 2,
    "platform_ops": 2,
}


@dataclass
class SimEvent:
    event_id: str
    run_id: str
    ts: str
    agent_id: str
    role: str
    event_type: str  # tool_call | tool_result | message | handoff | decision | system_event
    payload: dict[str, Any]
    order_id: str | None = None
    scenario_id: str | None = None


@dataclass
class SimRun:
    run_id: str
    seed: int
    agent_counts: dict[str, int]
    scenario_mix: list[str]
    events: list[SimEvent] = field(default_factory=list)
    status: str = "completed"
    started_at: str = ""
    completed_at: str = ""
    metrics: dict[str, Any] = field(default_factory=dict)


def _ts() -> str:
    return datetime.now(timezone.utc).isoformat()


class _Runner:
    def __init__(self, run_id: str, seed: int, agent_counts: dict[str, int], scenario_mix: list[str]) -> None:
        self.run_id = run_id
        self.rng = random.Random(seed)
        self.agent_counts = {**DEFAULT_AGENT_COUNTS, **agent_counts}
        self.scenario_mix = scenario_mix
        self.state: MarketplaceState = build_initial_state()
        self.events: list[SimEvent] = []
        # Agent index counters for cycling
        self._agent_idx: dict[str, int] = {role: 0 for role in self.agent_counts}

    def _next_agent(self, role: str) -> str:
        count = self.agent_counts.get(role, 1)
        if count == 0:
            count = 1
        idx = self._agent_idx[role] % count
        self._agent_idx[role] = idx + 1
        return f"{role}_{idx + 1:03d}"

    def _emit(
        self,
        agent_id: str,
        role: str,
        event_type: str,
        payload: dict[str, Any],
        order_id: str | None = None,
        scenario_id: str | None = None,
    ) -> SimEvent:
        ev = SimEvent(
            event_id=str(uuid.uuid4()),
            run_id=self.run_id,
            ts=_ts(),
            agent_id=agent_id,
            role=role,
            event_type=event_type,
            payload=payload,
            order_id=order_id,
            scenario_id=scenario_id,
        )
        self.events.append(ev)
        return ev

    def _tool(
        self,
        agent_id: str,
        role: str,
        tool_name: str,
        order_id: str | None = None,
        scenario_id: str | None = None,
        **kwargs: Any,
    ) -> tuple[dict[str, Any], str | None]:
        self._emit(agent_id, role, "tool_call", {"tool": tool_name, "arguments": kwargs}, order_id, scenario_id)
        result, error = call_tool(self.state, agent_id, role, tool_name, **kwargs)
        self._emit(
            agent_id, role, "tool_result",
            {"tool": tool_name, "output": result, "error": error},
            order_id, scenario_id,
        )
        return result, error

    def _message(self, agent_id: str, role: str, content: str, order_id: str | None = None, scenario_id: str | None = None) -> None:
        self._emit(agent_id, role, "message", {"content": content}, order_id, scenario_id)

    def _decision(self, agent_id: str, role: str, reasoning: str, chosen: str, order_id: str | None = None, scenario_id: str | None = None) -> None:
        self._emit(agent_id, role, "decision", {"reasoning": reasoning, "chosen": chosen}, order_id, scenario_id)

    def _handoff(
        self,
        from_agent: str,
        from_role: str,
        to_agent: str,
        to_role: str,
        payload: dict[str, Any],
        order_id: str | None = None,
        scenario_id: str | None = None,
    ) -> None:
        self._emit(from_agent, from_role, "handoff", {"to": to_agent, "to_role": to_role, "payload": payload}, order_id, scenario_id)

    def run_order(self, order_index: int) -> str | None:
        """Run one complete order workflow. Returns the order_id or None on failure."""
        scenario = get_scenario_for_order(self.scenario_mix, order_index)
        sid = scenario.scenario_id

        # Pick agents for this order
        cust_agent = self._next_agent("customer")
        rest_agent = self._next_agent("restaurant")
        disp_agent = self._next_agent("dispatch")
        cour_agent = self._next_agent("courier")
        pay_agent = self._next_agent("payments")
        sup_agent = self._next_agent("support")

        # Pick customer and restaurant deterministically
        customers = list(self.state.customers.keys())
        restaurants = list(self.state.restaurants.keys())
        customer_id = customers[order_index % len(customers)]
        restaurant_id = restaurants[order_index % len(restaurants)]
        restaurant = self.state.restaurants[restaurant_id]
        menu_items = restaurant.menu

        order_id: str | None = None

        # ── SCENARIO: permission_violation ────────────────────────────────────
        if sid == "permission_violation":
            self._message(cust_agent, "customer", f"I want to accept my own order at {restaurant.name}.", order_id, sid)
            # Customer attempts a restaurant-only tool
            item = menu_items[0]
            _, _ = self._tool(cust_agent, "customer", "search_restaurants", None, sid)
            _, _ = self._tool(cust_agent, "customer", "get_menu", None, sid, restaurant_id=restaurant_id)
            result, err = self._tool(cust_agent, "customer", "place_order", None, sid,
                                     customer_id=customer_id, restaurant_id=restaurant_id,
                                     items=[{"item_id": item.item_id, "qty": 1}])
            if not err:
                order_id = result.get("order_id")
            self._message(cust_agent, "customer", "I'll accept my own order directly.", order_id, sid)
            # This violates permission
            self._tool(cust_agent, "customer", "accept_order", order_id, sid, order_id=order_id)
            return order_id

        # ── Normal: customer places order ─────────────────────────────────────
        self._message(cust_agent, "customer", f"I want to order from {restaurant.name}.", None, sid)
        _, _ = self._tool(cust_agent, "customer", "search_restaurants", None, sid, cuisine=restaurant.cuisine)
        _, _ = self._tool(cust_agent, "customer", "get_menu", None, sid, restaurant_id=restaurant_id)

        # Pick 1-2 items
        n_items = self.rng.randint(1, min(2, len(menu_items)))
        chosen = self.rng.sample(menu_items, n_items)
        items_arg = [{"item_id": m.item_id, "qty": 1} for m in chosen]
        result, err = self._tool(cust_agent, "customer", "place_order", None, sid,
                                 customer_id=customer_id, restaurant_id=restaurant_id,
                                 items=items_arg)
        if err:
            self._message(cust_agent, "customer", f"Order placement failed: {err}", None, sid)
            return None
        order_id = result["order_id"]
        self.state.orders[order_id].scenario_id = sid
        self._message(cust_agent, "customer", f"Order {order_id} placed successfully.", order_id, sid)

        # ── SCENARIO: customer_cancels ────────────────────────────────────────
        if sid == "customer_cancels":
            self._message(cust_agent, "customer", "Changed my mind, cancelling the order.", order_id, sid)
            self._tool(cust_agent, "customer", "cancel_order", order_id, sid,
                       order_id=order_id, reason="Customer changed their mind", customer_id=customer_id)
            return order_id

        # ── Restaurant accepts/rejects ────────────────────────────────────────
        self._message(rest_agent, "restaurant", f"New order {order_id} received.", order_id, sid)
        _, _ = self._tool(rest_agent, "restaurant", "get_order", order_id, sid, order_id=order_id)

        if sid == "restaurant_rejects":
            self._decision(rest_agent, "restaurant", "Too many orders already, cannot accept.", "reject", order_id, sid)
            self._tool(rest_agent, "restaurant", "reject_order", order_id, sid,
                       order_id=order_id, reason="Restaurant at capacity")
            self._message(disp_agent, "dispatch", f"Order {order_id} was rejected, no courier needed.", order_id, sid)
            return order_id

        self._decision(rest_agent, "restaurant", "Capacity available, accepting.", "accept", order_id, sid)
        _, err = self._tool(rest_agent, "restaurant", "accept_order", order_id, sid, order_id=order_id)
        if err:
            return order_id
        self._tool(rest_agent, "restaurant", "update_preparation_status", order_id, sid,
                   order_id=order_id, status="preparing")
        self._tool(rest_agent, "restaurant", "update_preparation_status", order_id, sid,
                   order_id=order_id, status="ready")

        # ── SCENARIO: unsupported_promise ─────────────────────────────────────
        if sid == "unsupported_promise":
            self._message(sup_agent, "support", f"Customer contacting about order {order_id}.", order_id, sid)
            self._tool(sup_agent, "support", "get_order", order_id, sid, order_id=order_id)
            self._message(sup_agent, "support",
                          f"I can offer you a free meal voucher worth ₹500 for the delay on order {order_id}. "
                          "This will be applied to your next order.",
                          order_id, sid)
            # Support creates a case but makes a promise outside its authority
            self._tool(sup_agent, "support", "create_support_case", order_id, sid,
                       order_id=order_id, customer_id=customer_id,
                       description="Customer requesting compensation; agent promised free voucher.")
            # Fall through to continue order

        # ── Dispatch assigns courier ──────────────────────────────────────────
        self._message(disp_agent, "dispatch", f"Assigning courier to order {order_id}.", order_id, sid)
        avail_result, _ = self._tool(disp_agent, "dispatch", "get_courier_availability", order_id, sid)
        available_couriers = [c for c in avail_result.get("couriers", []) if c.get("available")]

        if sid == "wrong_courier":
            # Mark all couriers as unavailable, then try to assign one anyway
            for c in self.state.couriers.values():
                c.available = False
            # Still attempt assignment with a specific courier_id
            target_courier_id = "courier_001"
            self._decision(disp_agent, "dispatch",
                           f"courier_001 looks available in our stale records, assigning.",
                           f"assign {target_courier_id}", order_id, sid)
            self._tool(disp_agent, "dispatch", "assign_courier", order_id, sid,
                       order_id=order_id, courier_id=target_courier_id)
            # Restore availability for other orders
            for c in self.state.couriers.values():
                c.available = True
            return order_id

        if sid == "agent_loop":
            # Dispatch calls assign_courier 3x with identical arguments
            target_courier_id = available_couriers[0]["courier_id"] if available_couriers else "courier_001"
            for _ in range(3):
                self._tool(disp_agent, "dispatch", "assign_courier", order_id, sid,
                           order_id=order_id, courier_id=target_courier_id)
            return order_id

        if not available_couriers:
            self._message(disp_agent, "dispatch", f"No available couriers for order {order_id}.", order_id, sid)
            return order_id

        courier_id = available_couriers[0]["courier_id"]
        _, err = self._tool(disp_agent, "dispatch", "assign_courier", order_id, sid,
                             order_id=order_id, courier_id=courier_id)
        if err:
            return order_id

        # ── Courier delivers ──────────────────────────────────────────────────
        cour_agent_for_order = f"courier_{courier_id.split('_')[1]}"
        self._message(cour_agent_for_order, "courier", f"Accepting delivery for order {order_id}.", order_id, sid)
        self._tool(cour_agent_for_order, "courier", "accept_delivery", order_id, sid,
                   order_id=order_id, courier_id=courier_id)

        if sid == "courier_delayed":
            self._message(cour_agent_for_order, "courier",
                          "Stuck in traffic, will update when I can.", order_id, sid)
            # No status update — simulate the delay by simply returning
            self._tool(cour_agent_for_order, "courier", "update_delivery_status", order_id, sid,
                       order_id=order_id, status="picked_up")
            # Courier goes offline without delivering
            return order_id

        self._tool(cour_agent_for_order, "courier", "update_delivery_status", order_id, sid,
                   order_id=order_id, status="picked_up")
        self._tool(cour_agent_for_order, "courier", "update_delivery_status", order_id, sid,
                   order_id=order_id, status="delivered")
        self._message(cour_agent_for_order, "courier", f"Order {order_id} delivered successfully.", order_id, sid)

        # ── SCENARIO: stale_status ────────────────────────────────────────────
        if sid == "stale_status":
            self._message(cust_agent, "customer",
                          f"I want to cancel order {order_id}.", order_id, sid)
            self._tool(cust_agent, "customer", "get_order", order_id, sid, order_id=order_id)
            # Attempt cancel on delivered order
            self._tool(cust_agent, "customer", "cancel_order", order_id, sid,
                       order_id=order_id, reason="No longer needed", customer_id=customer_id)
            return order_id

        # ── Payment ───────────────────────────────────────────────────────────
        order = self.state.orders.get(order_id)
        amount = order.total if order else 0.0

        if sid == "duplicate_payment":
            self._message(pay_agent, "payments", f"Charging order {order_id} twice (bug).", order_id, sid)
            self._tool(pay_agent, "payments", "charge_payment", order_id, sid,
                       order_id=order_id, amount=amount)
            self._tool(pay_agent, "payments", "charge_payment", order_id, sid,
                       order_id=order_id, amount=amount)
            return order_id

        if sid == "payment_failure_recovery":
            self._message(pay_agent, "payments", f"Attempting charge for order {order_id}.", order_id, sid)
            # Simulate first failure by attempting with 0 amount (edge case)
            self._emit(pay_agent, "payments", "tool_call",
                       {"tool": "charge_payment", "arguments": {"order_id": order_id, "amount": amount}},
                       order_id, sid)
            self._emit(pay_agent, "payments", "tool_result",
                       {"tool": "charge_payment", "output": {}, "error": "gateway_timeout: payment provider unreachable"},
                       order_id, sid)
            self._message(pay_agent, "payments", "First attempt failed, retrying.", order_id, sid)
            self._tool(pay_agent, "payments", "charge_payment", order_id, sid,
                       order_id=order_id, amount=amount)
            return order_id

        if sid == "refund_no_evidence":
            # First charge successfully
            self._tool(pay_agent, "payments", "charge_payment", order_id, sid,
                       order_id=order_id, amount=amount)
            # Support promises refund, handoff to payments without evidence
            self._message(sup_agent, "support",
                          f"Customer is unhappy with order {order_id}. I will initiate a refund.", order_id, sid)
            # Handoff with missing order_id to demo incomplete_handoff variant; here we omit evidence
            self._handoff(sup_agent, "support", pay_agent, "payments",
                          {"note": "Please refund the customer"},  # missing order_id!
                          order_id, sid)
            # Payments issues refund without evidence
            self._tool(pay_agent, "payments", "issue_refund", order_id, sid,
                       order_id=order_id, amount=amount, evidence="")
            return order_id

        if sid == "incomplete_handoff":
            # Charge first
            self._tool(pay_agent, "payments", "charge_payment", order_id, sid,
                       order_id=order_id, amount=amount)
            # Support creates a case then hands off without order_id
            self._tool(sup_agent, "support", "create_support_case", order_id, sid,
                       order_id=order_id, customer_id=customer_id,
                       description="Customer wants a refund.")
            self._handoff(sup_agent, "support", pay_agent, "payments",
                          {"note": "Please process refund", "customer_id": customer_id},
                          # note: order_id intentionally missing
                          order_id, sid)
            # Payments tries to process but has no order_id
            self._tool(pay_agent, "payments", "issue_refund", order_id, sid,
                       order_id=order_id, amount=amount, evidence="support_case")
            return order_id

        # Normal payment
        self._tool(pay_agent, "payments", "charge_payment", order_id, sid,
                   order_id=order_id, amount=amount)
        self._message(pay_agent, "payments", f"Payment charged for order {order_id}.", order_id, sid)
        return order_id

    def run(self, num_orders: int = 20) -> list[str | None]:
        order_ids = []
        for i in range(num_orders):
            try:
                oid = self.run_order(i)
                order_ids.append(oid)
            except Exception:  # noqa: BLE001
                order_ids.append(None)
        return order_ids


def run_simulation(
    *,
    seed: int,
    agent_counts: dict[str, int] | None = None,
    scenario_mix: list[str] | None = None,
    num_orders: int = 20,
) -> SimRun:
    """Run a deterministic food-delivery simulation and return the SimRun."""
    run_id = str(uuid.uuid4())
    agent_counts = {**DEFAULT_AGENT_COUNTS, **(agent_counts or {})}
    scenario_mix = scenario_mix or [s for s in SCENARIO_MAP if s != "normal_completion"]

    runner = _Runner(run_id=run_id, seed=seed, agent_counts=agent_counts, scenario_mix=scenario_mix)
    started = _ts()
    runner.run(num_orders)
    completed = _ts()

    orders = list(runner.state.orders.values())
    metrics = {
        "total_orders": len(orders),
        "orders_delivered": sum(1 for o in orders if o.status == "delivered"),
        "orders_cancelled": sum(1 for o in orders if o.status == "cancelled"),
        "orders_rejected": sum(1 for o in orders if o.status == "rejected"),
        "total_events": len(runner.events),
        "tool_calls": sum(1 for e in runner.events if e.event_type == "tool_call"),
        "tool_errors": sum(1 for e in runner.events if e.event_type == "tool_result" and e.payload.get("error")),
        "per_order": {},  # filled by analyze step in API
    }

    return SimRun(
        run_id=run_id,
        seed=seed,
        agent_counts=agent_counts,
        scenario_mix=scenario_mix,
        events=runner.events,
        status="completed",
        started_at=started,
        completed_at=completed,
        metrics=metrics,
    )
