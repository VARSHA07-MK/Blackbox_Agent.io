"""Canonical, source-independent representation of an agent run."""

from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, model_validator

StepKind = Literal[
    "message",
    "tool_call",
    "tool_result",
    "handoff",
    "decision",
    "system_event",
]


class RecordModel(BaseModel):
    """Base model that keeps extension data explicit rather than silently ignored."""

    model_config = ConfigDict(extra="forbid")


class Task(RecordModel):
    goal: str
    constraints: list[str] = Field(default_factory=list)
    user_context: dict[str, Any] = Field(default_factory=dict)


class Agent(RecordModel):
    agent_id: str
    role: str | None = None
    model_hint: str | None = None


class Tool(RecordModel):
    name: str
    description: str | None = None
    input_schema: dict[str, Any] = Field(default_factory=dict)
    output_schema: dict[str, Any] = Field(default_factory=dict)
    mutating: bool = False


class Policy(RecordModel):
    policy_id: str
    text: str
    version: str | None = None


class ToolCall(RecordModel):
    tool: str
    arguments: dict[str, Any] = Field(default_factory=dict)


class ToolResult(RecordModel):
    tool: str
    output: Any = None
    error: str | None = None


class Handoff(RecordModel):
    from_: str = Field(alias="from")
    to: str
    payload: Any = None

    model_config = ConfigDict(extra="forbid", populate_by_name=True)


class Step(RecordModel):
    index: int = Field(ge=0)
    actor: str
    kind: StepKind
    content: str | None = None
    tool_call: ToolCall | None = None
    tool_result: ToolResult | None = None
    handoff: Handoff | None = None
    ts: str | None = None
    meta: dict[str, Any] = Field(default_factory=dict)

    @model_validator(mode="after")
    def payload_matches_kind(self) -> Step:
        expected = {
            "tool_call": self.tool_call,
            "tool_result": self.tool_result,
            "handoff": self.handoff,
        }
        payload = expected.get(self.kind)
        if self.kind in expected and payload is None:
            raise ValueError(f"kind '{self.kind}' requires its matching payload")
        for kind, value in expected.items():
            if kind != self.kind and value is not None:
                raise ValueError(f"kind '{self.kind}' cannot include {kind} payload")
        return self


class FlightRecord(RecordModel):
    record_id: str
    schema_version: Literal["1"] = "1"
    source_format: str = "generic-jsonl"
    task: Task
    agents: list[Agent] = Field(default_factory=list)
    tools: list[Tool] = Field(default_factory=list)
    policies: list[Policy] = Field(default_factory=list)
    steps: list[Step] = Field(min_length=1)

    @model_validator(mode="after")
    def indexes_are_sequential(self) -> FlightRecord:
        for expected, step in enumerate(self.steps):
            if step.index != expected:
                raise ValueError(
                    f"steps[{expected}].index must be {expected}, got {step.index}"
                )
        return self
