"""Pydantic request/response models for the adoption coordinator API."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class EnrollRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    rulebook: str = "retail-core"
    notes: str = ""


class TriggerConfig(BaseModel):
    model_config = ConfigDict(extra="ignore")

    trigger_type: str  # manual | version_change | scheduled_sample | failed_run | percentage_sample | regression_suite
    description: str = ""
    params: dict[str, Any] = {}


class ValidateSampleRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    trace: str
    source_format: str = "generic-jsonl"


class AgentRegistryEntry(BaseModel):
    agent_id: str
    agent_name: str
    application: str
    owner_email: str
    environment: str
    trace_format: str
    status: str
    description: str = ""
    registry_source: str = "demo"
    # Enrollment fields (None if not enrolled)
    rulebook: str | None = None
    triggers: list[dict[str, Any]] | None = None
    last_analyzed_at: str | None = None
    analysis_count: int = 0
    violation_count: int = 0
    pnr_count: int = 0
    enrolled_at: str | None = None
    notes: str = ""
