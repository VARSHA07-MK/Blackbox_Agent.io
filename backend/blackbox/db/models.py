from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import Boolean, DateTime, Integer, String, func
from sqlalchemy.dialects.sqlite import JSON
from sqlalchemy.orm import Mapped, mapped_column

from blackbox.db.base import Base


class Investigation(Base):
    __tablename__ = "investigations"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    record_id: Mapped[str] = mapped_column(String, index=True)
    task_goal: Mapped[str] = mapped_column(String)
    step_count: Mapped[int] = mapped_column(Integer)
    violation_count: Mapped[int] = mapped_column(Integer)
    pnr_step: Mapped[int | None] = mapped_column(Integer, nullable=True)
    taxonomy_code: Mapped[str | None] = mapped_column(String, nullable=True)
    basis: Mapped[str] = mapped_column(String)
    trace_hash: Mapped[str] = mapped_column(String)
    result_json: Mapped[dict[str, Any]] = mapped_column(JSON)


class SimulationRun(Base):
    __tablename__ = "simulation_runs"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    seed: Mapped[int] = mapped_column(Integer)
    agent_counts: Mapped[dict[str, Any]] = mapped_column(JSON)
    scenario_mix: Mapped[list[Any]] = mapped_column(JSON)
    num_orders: Mapped[int] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String)
    started_at: Mapped[str] = mapped_column(String)
    completed_at: Mapped[str | None] = mapped_column(String, nullable=True)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSON)
    events_json: Mapped[list[Any]] = mapped_column(JSON)


class EnrolledAgent(Base):
    __tablename__ = "enrolled_agents"

    agent_id: Mapped[str] = mapped_column(String, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    agent_name: Mapped[str] = mapped_column(String)
    application: Mapped[str] = mapped_column(String)
    owner_email: Mapped[str] = mapped_column(String)
    environment: Mapped[str] = mapped_column(String)
    trace_format: Mapped[str] = mapped_column(String)
    status: Mapped[str] = mapped_column(String, default="setup_needed")
    rulebook: Mapped[str] = mapped_column(String, default="retail-core")
    triggers: Mapped[list[Any]] = mapped_column(JSON, default=list)
    last_analyzed_at: Mapped[str | None] = mapped_column(String, nullable=True)
    analysis_count: Mapped[int] = mapped_column(Integer, default=0)
    violation_count: Mapped[int] = mapped_column(Integer, default=0)
    pnr_count: Mapped[int] = mapped_column(Integer, default=0)
    enrolled_at: Mapped[str | None] = mapped_column(String, nullable=True)
    notes: Mapped[str] = mapped_column(String, default="")


class ApiKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[str] = mapped_column(String, primary_key=True)
    name: Mapped[str] = mapped_column(String, default="")
    key_prefix: Mapped[str] = mapped_column(String)
    key_hash: Mapped[str] = mapped_column(String)
    app_id: Mapped[str | None] = mapped_column(String, nullable=True)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
    )
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    use_count: Mapped[int] = mapped_column(Integer, default=0)
