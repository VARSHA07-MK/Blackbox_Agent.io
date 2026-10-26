"""Demo agent registry.

IMPORTANT: This is a SIMULATED demo registry with synthetic agents. It does not
represent any real application, team, or service. Connecting real internal agents
to Blackbox requires an owner-provided registry and explicit enrollment approval.
"""

from __future__ import annotations

from typing import Any

# Synthetic demo agents — all data is fictional
DEMO_REGISTRY: list[dict[str, Any]] = [
    {
        "agent_id": "order-routing-v2",
        "agent_name": "order-routing-v2",
        "application": "Marketplace Platform",
        "owner_email": "platform-team@example.com",
        "environment": "staging",
        "trace_format": "generic-jsonl",
        "status": "not_enrolled",
        "description": "Routes incoming orders to the nearest available restaurant based on customer location.",
        "registry_source": "demo",
    },
    {
        "agent_id": "customer-support-bot",
        "agent_name": "customer-support-bot",
        "application": "Support Suite",
        "owner_email": "cx-team@example.com",
        "environment": "production",
        "trace_format": "flight-record-1",
        "status": "not_enrolled",
        "description": "Handles tier-1 customer inquiries, refunds, and order status queries.",
        "registry_source": "demo",
    },
    {
        "agent_id": "fraud-detection-agent",
        "agent_name": "fraud-detection-agent",
        "application": "Payments Core",
        "owner_email": "payments-team@example.com",
        "environment": "production",
        "trace_format": "generic-jsonl",
        "status": "not_enrolled",
        "description": "Scores payment transactions and flags suspicious patterns before authorization.",
        "registry_source": "demo",
    },
    {
        "agent_id": "menu-sync-bot",
        "agent_name": "menu-sync-bot",
        "application": "Restaurant Hub",
        "owner_email": "ops-team@example.com",
        "environment": "staging",
        "trace_format": "generic-jsonl",
        "status": "not_enrolled",
        "description": "Keeps restaurant menus in sync across all regional databases.",
        "registry_source": "demo",
    },
    {
        "agent_id": "promo-code-redeemer",
        "agent_name": "promo-code-redeemer",
        "application": "Marketing Platform",
        "owner_email": "marketing-team@example.com",
        "environment": "staging",
        "trace_format": "generic-jsonl",
        "status": "not_enrolled",
        "description": "Validates and applies promotional codes at checkout.",
        "registry_source": "demo",
    },
    {
        "agent_id": "courier-dispatch-v3",
        "agent_name": "courier-dispatch-v3",
        "application": "Logistics Engine",
        "owner_email": "logistics-team@example.com",
        "environment": "production",
        "trace_format": "flight-record-1",
        "status": "not_enrolled",
        "description": "Optimises courier assignments using real-time availability and ETA data.",
        "registry_source": "demo",
    },
    {
        "agent_id": "refund-processor",
        "agent_name": "refund-processor",
        "application": "Finance Ops",
        "owner_email": "finance-team@example.com",
        "environment": "production",
        "trace_format": "generic-jsonl",
        "status": "not_enrolled",
        "description": "Processes approved refund requests and reconciles them against payment records.",
        "registry_source": "demo",
    },
    {
        "agent_id": "onboarding-wizard",
        "agent_name": "onboarding-wizard",
        "application": "Merchant Onboarding",
        "owner_email": "growth-team@example.com",
        "environment": "staging",
        "trace_format": "generic-jsonl",
        "status": "not_enrolled",
        "description": "Guides new restaurants through the onboarding flow and menu configuration.",
        "registry_source": "demo",
    },
]

DEMO_REGISTRY_MAP: dict[str, dict[str, Any]] = {a["agent_id"]: a for a in DEMO_REGISTRY}


def get_demo_agent(agent_id: str) -> dict[str, Any] | None:
    return DEMO_REGISTRY_MAP.get(agent_id)


# Sample JSONL trace for demo walkthrough (order-routing-v2)
DEMO_SAMPLE_TRACE = "\n".join([
    '{"actor": "user", "kind": "message", "content": "Route order ORD-9921 to the best restaurant."}',
    '{"actor": "order-routing-v2", "kind": "tool_call", "tool_call": {"tool": "search_restaurants", "arguments": {"cuisine": "Indian"}}}',
    '{"actor": "order-routing-v2", "kind": "tool_result", "tool_result": {"tool": "search_restaurants", "output": {"restaurants": [{"restaurant_id": "rest_001", "name": "SpiceRoute", "available": true}]}, "error": null}}',
    '{"actor": "order-routing-v2", "kind": "decision", "content": "SpiceRoute is available and highest-rated for this cuisine."}',
    '{"actor": "order-routing-v2", "kind": "tool_call", "tool_call": {"tool": "assign_courier", "arguments": {"order_id": "ORD-9921", "courier_id": "courier_001"}}}',
    '{"actor": "order-routing-v2", "kind": "tool_result", "tool_result": {"tool": "assign_courier", "output": {"status": "assigned"}, "error": null}}',
])
