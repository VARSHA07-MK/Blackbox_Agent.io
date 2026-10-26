"""Adoption coordinator logic — enrollment, trigger evaluation, sample validation."""

from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from blackbox.adoption.registry import DEMO_REGISTRY_MAP, get_demo_agent
from blackbox.db.models import EnrolledAgent


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


def merge_registry_with_enrollment(
    enrolled_map: dict[str, EnrolledAgent],
) -> list[dict[str, Any]]:
    """Merge demo registry with live enrollment records from DB."""
    result: list[dict[str, Any]] = []
    for agent_id, demo in DEMO_REGISTRY_MAP.items():
        enrolled = enrolled_map.get(agent_id)
        entry = {**demo}
        if enrolled:
            entry["status"] = enrolled.status
            entry["rulebook"] = enrolled.rulebook
            entry["triggers"] = enrolled.triggers or []
            entry["last_analyzed_at"] = enrolled.last_analyzed_at
            entry["analysis_count"] = enrolled.analysis_count
            entry["violation_count"] = enrolled.violation_count
            entry["pnr_count"] = enrolled.pnr_count
            entry["enrolled_at"] = enrolled.enrolled_at
            entry["notes"] = enrolled.notes
        else:
            entry["status"] = "not_enrolled"
            entry["rulebook"] = None
            entry["triggers"] = None
            entry["last_analyzed_at"] = None
            entry["analysis_count"] = 0
            entry["violation_count"] = 0
            entry["pnr_count"] = 0
            entry["enrolled_at"] = None
            entry["notes"] = ""
        result.append(entry)
    return result


def build_dashboard_metrics(agents: list[dict[str, Any]]) -> dict[str, Any]:
    statuses = [a["status"] for a in agents]
    enrolled_statuses = {"setup_needed", "sample_passed", "active"}
    return {
        "total_discovered": len(agents),
        "enrolled": sum(1 for s in statuses if s in enrolled_statuses),
        "active": sum(1 for s in statuses if s == "active"),
        "setup_needed": sum(1 for s in statuses if s == "setup_needed"),
        "sample_passed": sum(1 for s in statuses if s == "sample_passed"),
        "paused": sum(1 for s in statuses if s == "paused"),
        "not_enrolled": sum(1 for s in statuses if s == "not_enrolled"),
        "error": sum(1 for s in statuses if s == "error"),
        "total_analyses": sum(a.get("analysis_count", 0) for a in agents),
        "total_violations": sum(a.get("violation_count", 0) for a in agents),
        "total_pnr_findings": sum(a.get("pnr_count", 0) for a in agents),
    }


INTEGRATION_METHODS = [
    {
        "method_id": "api-push",
        "name": "API Push",
        "description": "Send Flight Record JSON or generic JSONL to POST /v1/analyze after each run.",
        "docs_url": "/docs#/default/analyze_v1_analyze_post",
    },
    {
        "method_id": "sdk-hook",
        "name": "SDK Hook",
        "description": "Use a framework adapter (LangChain, CrewAI, custom) that wraps your agent and emits a trace automatically.",
        "docs_url": None,
    },
    {
        "method_id": "manual-upload",
        "name": "Manual Upload",
        "description": "Export a trace file and upload it via the Investigations page for initial evaluation.",
        "docs_url": None,
    },
]

TRIGGER_TYPES = [
    {
        "trigger_type": "manual",
        "label": "Manual",
        "description": "Trigger analysis manually from the dashboard.",
    },
    {
        "trigger_type": "version_change",
        "label": "Version / Deployment Change",
        "description": "Trigger on each new deployment or version tag.",
    },
    {
        "trigger_type": "scheduled_sample",
        "label": "Scheduled Sample",
        "description": "Analyze a sample of recent runs on a schedule (e.g. daily).",
    },
    {
        "trigger_type": "failed_run",
        "label": "Failed Run",
        "description": "Trigger when the owning application marks a run as failed.",
    },
    {
        "trigger_type": "percentage_sample",
        "label": "Percentage Sample",
        "description": "Analyze a configured percentage (e.g. 5%) of all staging runs.",
    },
    {
        "trigger_type": "regression_suite",
        "label": "Regression Suite",
        "description": "Run a fixed benchmark suite of traces to detect regressions.",
    },
]


def get_enrollment_checklist(agent_id: str) -> list[dict[str, Any]]:
    """Return the 7-step adoption checklist for a given agent."""
    demo = get_demo_agent(agent_id)
    agent_name = demo["agent_name"] if demo else agent_id
    return [
        {
            "step": 1,
            "title": "Confirm agent details",
            "description": f"Verify agent name, application, owner, and environment for {agent_name}.",
        },
        {
            "step": 2,
            "title": "Choose integration method",
            "description": "Select how your agent will send traces to Blackbox.",
            "options": INTEGRATION_METHODS,
        },
        {
            "step": 3,
            "title": "Map events to Blackbox fields",
            "description": "Map your agent's events to: user request, agent messages, tool calls, tool results, errors, decisions, and handoffs.",
        },
        {
            "step": 4,
            "title": "Select rulebook and redaction settings",
            "description": "Choose the Blackbox rulebook to apply and configure any PII redaction fields.",
        },
        {
            "step": 5,
            "title": "Run a staging sample",
            "description": "Submit a small trace for validation. Fix any schema errors before proceeding.",
        },
        {
            "step": 6,
            "title": "Review first investigation",
            "description": "Inspect the evidence ledger and PNR finding from your sample trace with the agent owner.",
        },
        {
            "step": 7,
            "title": "Enable ongoing test triggers",
            "description": "Configure when Blackbox should automatically analyze future runs.",
            "options": TRIGGER_TYPES,
        },
    ]
