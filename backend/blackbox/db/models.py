from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from sqlalchemy import DateTime, Integer, String
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
