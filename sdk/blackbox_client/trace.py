"""Helpers for building Flight Record traces programmatically."""
from __future__ import annotations

import json
import uuid
from typing import Any


class TraceBuilder:
    """Build a JSONL trace step by step."""

    def __init__(self, agent_id: str = "agent", goal: str = ""):
        self.agent_id = agent_id
        self.goal = goal
        self._steps: list[dict[str, Any]] = []

    def message(self, content: str, actor: str | None = None) -> "TraceBuilder":
        self._steps.append({"actor": actor or self.agent_id, "kind": "message", "content": content})
        return self

    def tool_call(
        self, tool: str, arguments: dict[str, Any], actor: str | None = None
    ) -> "TraceBuilder":
        self._steps.append(
            {
                "actor": actor or self.agent_id,
                "kind": "tool_call",
                "tool_call": {"tool": tool, "arguments": arguments},
            }
        )
        return self

    def tool_result(
        self,
        tool: str,
        output: Any = None,
        error: str | None = None,
        actor: str | None = None,
    ) -> "TraceBuilder":
        self._steps.append(
            {
                "actor": actor or self.agent_id,
                "kind": "tool_result",
                "tool_result": {"tool": tool, "output": output, "error": error},
            }
        )
        return self

    def decision(self, content: str, actor: str | None = None) -> "TraceBuilder":
        self._steps.append(
            {"actor": actor or self.agent_id, "kind": "decision", "content": content}
        )
        return self

    def handoff(
        self, to: str, payload: Any = None, actor: str | None = None
    ) -> "TraceBuilder":
        self._steps.append(
            {
                "actor": actor or self.agent_id,
                "kind": "handoff",
                "handoff": {"from": actor or self.agent_id, "to": to, "payload": payload},
            }
        )
        return self

    def to_jsonl(self) -> str:
        return "\n".join(json.dumps(s, ensure_ascii=False) for s in self._steps)

    def to_flight_record(self, record_id: str | None = None) -> dict[str, Any]:
        record_id = record_id or f"rec_{uuid.uuid4().hex[:8]}"
        return {
            "record_id": record_id,
            "schema_version": "1",
            "task": {"goal": self.goal},
            "steps": [{"index": i, **s} for i, s in enumerate(self._steps)],
        }
