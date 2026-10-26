"""Simulated tool implementations for the food-delivery marketplace.

All tools operate on the in-memory MarketplaceState. No real external services
are called. Tool results are returned as (result_dict, error_or_None).
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from blackbox.simulation.marketplace import (
    MarketplaceState,
    Order,
    PaymentRecord,
    SupportCase,
    _now,
)

# Maps tool name → allowed roles
TOOL_PERMISSIONS: dict[str, set[str]] = {
    "search_restaurants": {"customer", "dispatch", "support", "platform_ops"},
    "get_menu": {"customer", "restaurant", "support"},
    "place_order": {"customer"},
    "get_order": {"customer", "restaurant", "courier", "dispatch", "support", "payments", "platform_ops"},
    "accept_order": {"restaurant"},
    "reject_order": {"restaurant"},
    "update_preparation_status": {"restaurant"},
    "assign_courier": {"dispatch"},
    "accept_delivery": {"courier"},
    "update_delivery_status": {"courier"},
    "cancel_order": {"customer", "support", "platform_ops"},
    "charge_payment": {"payments"},
    "issue_refund": {"payments"},
    "contact_support": {"customer"},
    "create_support_case": {"support"},
    "resolve_support_case": {"support"},
    "get_courier_availability": {"dispatch", "platform_ops"},
    "get_platform_metrics": {"platform_ops"},
}


def _check_permission(agent_id: str, role: str, tool_name: str) -> str | None:
    allowed = TOOL_PERMISSIONS.get(tool_name, set())
    if role not in allowed:
        return f"permission_denied: {agent_id} ({role}) cannot call {tool_name}"
    return None


def call_tool(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    tool_name: str,
    **kwargs: Any,
) -> tuple[dict[str, Any], str | None]:
    """Dispatch to the named tool. Returns (result, error)."""
    err = _check_permission(agent_id, role, tool_name)
    if err:
        return {}, err

    handler = _HANDLERS.get(tool_name)
    if handler is None:
        return {}, f"unknown_tool: {tool_name}"

    try:
        return handler(state, agent_id, role, **kwargs)
    except Exception as exc:  # noqa: BLE001
        return {}, f"tool_error: {exc}"


# ── Individual tool handlers ──────────────────────────────────────────────────

def _search_restaurants(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    cuisine: str | None = None,
    name: str | None = None,
) -> tuple[dict[str, Any], None]:
    results = list(state.restaurants.values())
    if cuisine:
        results = [r for r in results if r.cuisine.lower() == cuisine.lower()]
    if name:
        results = [r for r in results if name.lower() in r.name.lower()]
    return {
        "restaurants": [
            {
                "restaurant_id": r.restaurant_id,
                "name": r.name,
                "cuisine": r.cuisine,
                "rating": r.rating,
                "open": r.open,
            }
            for r in results
        ]
    }, None


def _get_menu(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    restaurant_id: str = "",
) -> tuple[dict[str, Any], str | None]:
    rest = state.restaurants.get(restaurant_id)
    if not rest:
        return {}, f"not_found: restaurant {restaurant_id}"
    return {
        "restaurant_id": rest.restaurant_id,
        "name": rest.name,
        "items": [
            {"item_id": m.item_id, "name": m.name, "price": m.price, "category": m.category}
            for m in rest.menu
        ],
    }, None


def _place_order(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    customer_id: str = "",
    restaurant_id: str = "",
    items: list[dict[str, Any]] | None = None,
) -> tuple[dict[str, Any], str | None]:
    if not items:
        return {}, "validation_error: items cannot be empty"
    if customer_id not in state.customers:
        return {}, f"not_found: customer {customer_id}"
    rest = state.restaurants.get(restaurant_id)
    if not rest:
        return {}, f"not_found: restaurant {restaurant_id}"
    if not rest.open:
        return {}, f"restaurant_closed: {restaurant_id} is not accepting orders"

    menu_map = {m.item_id: m for m in rest.menu}
    order_items = []
    total = 0.0
    for item in items:
        iid = item.get("item_id", "")
        qty = int(item.get("qty", 1))
        menu_item = menu_map.get(iid)
        if not menu_item:
            return {}, f"not_found: menu item {iid}"
        subtotal = menu_item.price * qty
        total += subtotal
        order_items.append(
            {"item_id": iid, "name": menu_item.name, "qty": qty, "price": menu_item.price, "subtotal": subtotal}
        )

    order_id = f"ord_{uuid.uuid4().hex[:8]}"
    ts = _now()
    order = Order(
        order_id=order_id,
        customer_id=customer_id,
        restaurant_id=restaurant_id,
        items=order_items,
        total=round(total, 2),
        status="placed",
        payment_status="pending",
        assigned_courier=None,
        created_at=ts,
        updated_at=ts,
    )
    state.orders[order_id] = order
    return {
        "order_id": order_id,
        "customer_id": customer_id,
        "restaurant_id": restaurant_id,
        "total": order.total,
        "status": "placed",
    }, None


def _get_order(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    customer_id: str | None = None,
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    if role == "customer" and customer_id and order.customer_id != customer_id:
        return {}, f"forbidden: order {order_id} does not belong to customer {customer_id}"
    return {
        "order_id": order.order_id,
        "customer_id": order.customer_id,
        "restaurant_id": order.restaurant_id,
        "items": order.items,
        "total": order.total,
        "status": order.status,
        "payment_status": order.payment_status,
        "assigned_courier": order.assigned_courier,
        "created_at": order.created_at,
        "updated_at": order.updated_at,
    }, None


def _accept_order(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    if order.status != "placed":
        return {}, f"invalid_state: order {order_id} is {order.status}, expected placed"
    order.status = "accepted"
    order.updated_at = _now()
    return {"order_id": order_id, "status": "accepted"}, None


def _reject_order(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    reason: str = "",
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    if order.status not in ("placed",):
        return {}, f"invalid_state: order {order_id} is {order.status}, expected placed"
    order.status = "rejected"
    order.updated_at = _now()
    return {"order_id": order_id, "status": "rejected", "reason": reason}, None


def _update_preparation_status(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    status: str = "",
) -> tuple[dict[str, Any], str | None]:
    valid_statuses = {"preparing", "ready"}
    if status not in valid_statuses:
        return {}, f"invalid_status: {status}; must be one of {valid_statuses}"
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    if order.status not in ("accepted", "preparing"):
        return {}, f"invalid_state: cannot set {status} when order is {order.status}"
    order.status = status
    order.updated_at = _now()
    return {"order_id": order_id, "status": status}, None


def _assign_courier(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    courier_id: str = "",
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    courier = state.couriers.get(courier_id)
    if not courier:
        return {}, f"not_found: courier {courier_id}"
    if not courier.available:
        return {}, f"courier_unavailable: {courier_id} is not available"
    if order.status not in ("accepted", "preparing", "ready"):
        return {}, f"invalid_state: cannot assign courier when order is {order.status}"
    courier.available = False
    courier.current_order = order_id
    order.assigned_courier = courier_id
    order.status = "assigned"
    order.updated_at = _now()
    return {"order_id": order_id, "courier_id": courier_id, "status": "assigned"}, None


def _accept_delivery(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    courier_id: str = "",
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    if order.assigned_courier != courier_id:
        return {}, f"forbidden: courier {courier_id} not assigned to order {order_id}"
    if order.status != "assigned":
        return {}, f"invalid_state: order {order_id} is {order.status}, expected assigned"
    order.updated_at = _now()
    return {"order_id": order_id, "courier_id": courier_id, "accepted": True}, None


def _update_delivery_status(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    status: str = "",
) -> tuple[dict[str, Any], str | None]:
    valid = {"picked_up", "delivered"}
    if status not in valid:
        return {}, f"invalid_status: {status}; must be one of {valid}"
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    if status == "picked_up" and order.status not in ("assigned",):
        return {}, f"invalid_state: cannot set picked_up when order is {order.status}"
    if status == "delivered" and order.status not in ("picked_up",):
        return {}, f"invalid_state: cannot set delivered when order is {order.status}"

    order.status = status
    order.updated_at = _now()

    if status == "delivered":
        courier = state.couriers.get(order.assigned_courier or "")
        if courier:
            courier.available = True
            courier.current_order = None

    return {"order_id": order_id, "status": status}, None


def _cancel_order(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    reason: str = "",
    customer_id: str | None = None,
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    if role == "customer" and customer_id and order.customer_id != customer_id:
        return {}, f"forbidden: order {order_id} does not belong to customer {customer_id}"
    if order.status == "delivered":
        return {}, f"invalid_state: cannot cancel order {order_id} — it has been delivered"
    if order.status == "cancelled":
        return {}, f"invalid_state: order {order_id} is already cancelled"

    if order.assigned_courier:
        courier = state.couriers.get(order.assigned_courier)
        if courier:
            courier.available = True
            courier.current_order = None

    order.status = "cancelled"
    order.updated_at = _now()
    return {"order_id": order_id, "status": "cancelled", "reason": reason}, None


def _charge_payment(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    amount: float = 0.0,
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    payment_id = f"pay_{uuid.uuid4().hex[:8]}"
    if order_id not in state.payments:
        state.payments[order_id] = PaymentRecord(
            order_id=order_id,
            charge_amount=0.0,
            charge_count=0,
            refund_amount=0.0,
        )
    rec = state.payments[order_id]
    rec.charge_amount += amount
    rec.charge_count += 1
    rec.charge_ids.append(payment_id)
    order.payment_status = "charged"
    order.updated_at = _now()
    return {"payment_id": payment_id, "order_id": order_id, "amount": amount, "status": "charged"}, None


def _issue_refund(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    amount: float = 0.0,
    evidence: str = "",
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    rec = state.payments.get(order_id)
    if not rec:
        return {}, f"no_payment: no payment found for order {order_id}"
    if amount > (rec.charge_amount - rec.refund_amount):
        return {}, (
            f"refund_exceeds_balance: refund {amount} > available "
            f"{rec.charge_amount - rec.refund_amount}"
        )
    refund_id = f"ref_{uuid.uuid4().hex[:8]}"
    rec.refund_amount += amount
    order.payment_status = "refunded"
    order.updated_at = _now()
    return {"refund_id": refund_id, "order_id": order_id, "amount": amount, "status": "refunded"}, None


def _contact_support(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    message: str = "",
    customer_id: str | None = None,
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    case_id = f"case_{uuid.uuid4().hex[:8]}"
    case = SupportCase(
        case_id=case_id,
        order_id=order_id,
        customer_id=order.customer_id,
        description=message,
        status="open",
    )
    state.support_cases[case_id] = case
    if not order.support_case_id:
        order.support_case_id = case_id
    return {"case_id": case_id, "order_id": order_id, "status": "open"}, None


def _create_support_case(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    order_id: str = "",
    customer_id: str = "",
    description: str = "",
) -> tuple[dict[str, Any], str | None]:
    order = state.orders.get(order_id)
    if not order:
        return {}, f"not_found: order {order_id}"
    case_id = f"case_{uuid.uuid4().hex[:8]}"
    case = SupportCase(
        case_id=case_id,
        order_id=order_id,
        customer_id=customer_id or order.customer_id,
        description=description,
        status="open",
    )
    state.support_cases[case_id] = case
    return {"case_id": case_id, "order_id": order_id, "status": "open"}, None


def _resolve_support_case(
    state: MarketplaceState,
    agent_id: str,
    role: str,
    case_id: str = "",
    resolution: str = "",
) -> tuple[dict[str, Any], str | None]:
    case = state.support_cases.get(case_id)
    if not case:
        return {}, f"not_found: support case {case_id}"
    case.status = "resolved"
    case.resolution = resolution
    return {"case_id": case_id, "status": "resolved", "resolution": resolution}, None


def _get_courier_availability(
    state: MarketplaceState,
    agent_id: str,
    role: str,
) -> tuple[dict[str, Any], None]:
    return {
        "couriers": [
            {
                "courier_id": c.courier_id,
                "name": c.name,
                "available": c.available,
                "current_order": c.current_order,
            }
            for c in state.couriers.values()
        ]
    }, None


def _get_platform_metrics(
    state: MarketplaceState,
    agent_id: str,
    role: str,
) -> tuple[dict[str, Any], None]:
    orders = list(state.orders.values())
    return {
        "total_orders": len(orders),
        "by_status": {
            status: sum(1 for o in orders if o.status == status)
            for status in ("placed", "accepted", "rejected", "preparing", "ready",
                           "assigned", "picked_up", "delivered", "cancelled")
        },
        "available_couriers": sum(1 for c in state.couriers.values() if c.available),
        "total_revenue": sum(
            state.payments[o.order_id].charge_amount
            for o in orders
            if o.order_id in state.payments
        ),
    }, None


_HANDLERS = {
    "search_restaurants": _search_restaurants,
    "get_menu": _get_menu,
    "place_order": _place_order,
    "get_order": _get_order,
    "accept_order": _accept_order,
    "reject_order": _reject_order,
    "update_preparation_status": _update_preparation_status,
    "assign_courier": _assign_courier,
    "accept_delivery": _accept_delivery,
    "update_delivery_status": _update_delivery_status,
    "cancel_order": _cancel_order,
    "charge_payment": _charge_payment,
    "issue_refund": _issue_refund,
    "contact_support": _contact_support,
    "create_support_case": _create_support_case,
    "resolve_support_case": _resolve_support_case,
    "get_courier_availability": _get_courier_availability,
    "get_platform_metrics": _get_platform_metrics,
}
