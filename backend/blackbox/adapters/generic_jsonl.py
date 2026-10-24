"""Adapter for newline-delimited JSON events (one Flight Record step per line)."""

from __future__ import annotations

import json
from collections.abc import Mapping
from typing import Any
from uuid import uuid4

from pydantic import ValidationError

from blackbox.normalizer.models import FlightRecord


class TraceFormatError(ValueError):
    """Invalid trace data with a source location suitable for an API response."""

    def __init__(self, path: str, message: str) -> None:
        self.path = path
        self.message = message
        super().__init__(f"{path}: {message}")


def normalize_jsonl(
    raw: str | bytes,
    *,
    task: Mapping[str, Any] | None = None,
    record_id: str | None = None,
) -> FlightRecord:
    """Parse generic JSONL events into a validated canonical Flight Record.

    Each non-empty line must be a JSON object representing a step. If task metadata
    is not supplied, the first user message becomes the task goal.
    """
    if isinstance(raw, bytes):
        try:
            text = raw.decode("utf-8")
        except UnicodeDecodeError as exc:
            raise TraceFormatError("$", "input must be valid UTF-8") from exc
    else:
        text = raw

    events: list[dict[str, Any]] = []
    source_lines: list[int] = []
    for line_number, line in enumerate(text.splitlines(), start=1):
        if not line.strip():
            continue
        try:
            value = json.loads(line)
        except json.JSONDecodeError as exc:
            raise TraceFormatError(
                f"line {line_number}", f"invalid JSON at column {exc.colno}: {exc.msg}"
            ) from exc
        if not isinstance(value, dict):
            raise TraceFormatError(f"line {line_number}", "each event must be a JSON object")
        events.append(value)
        source_lines.append(line_number)

    if not events:
        raise TraceFormatError("$", "trace must contain at least one event")

    normalized_events: list[dict[str, Any]] = []
    for index, (event, line_number) in enumerate(zip(events, source_lines, strict=True)):
        # JSONL ordering is authoritative; canonical indexes are assigned by the adapter.
        normalized = {**event, "index": index}
        try:
            from blackbox.normalizer.models import Step

            normalized_events.append(Step.model_validate(normalized).model_dump(by_alias=True))
        except ValidationError as exc:
            error = exc.errors(include_url=False)[0]
            path = ".".join(str(part) for part in error["loc"])
            raise TraceFormatError(
                f"line {line_number}" + (f".{path}" if path else ""), str(error["msg"])
            ) from exc

    task_value: Mapping[str, Any]
    if task is not None:
        task_value = task
    else:
        first_user_message = next(
            (
                event.get("content")
                for event in normalized_events
                if event.get("actor") == "user"
                and event.get("kind") == "message"
                and isinstance(event.get("content"), str)
                and event["content"].strip()
            ),
            None,
        )
        if first_user_message is None:
            raise TraceFormatError(
                "$.task.goal",
                "task metadata is required when the trace has no user message",
            )
        task_value = {"goal": first_user_message}

    payload = {
        "record_id": record_id or str(uuid4()),
        "schema_version": "1",
        "source_format": "generic-jsonl",
        "task": task_value,
        "steps": normalized_events,
    }
    try:
        return FlightRecord.model_validate(payload)
    except ValidationError as exc:
        error = exc.errors(include_url=False)[0]
        path = ".".join(str(part) for part in error["loc"])
        raise TraceFormatError(f"$.{path}" if path else "$", str(error["msg"])) from exc
