"""AutoGen conversation hook adapter."""
from __future__ import annotations

import json
from typing import Any

from blackbox_client.client import BlackboxClient
from blackbox_client.trace import TraceBuilder


class BlackboxAutoGenHook:
    """Hook into an AutoGen agent group chat to capture messages and tool calls.

    Usage::

        import autogen
        from blackbox_client import BlackboxClient
        from blackbox_client.adapters.autogen import BlackboxAutoGenHook

        bb = BlackboxClient(api_key="bb_live_...")
        hook = BlackboxAutoGenHook(bb, goal="Automate data pipeline")

        orig = assistant.receive
        assistant.receive = lambda msg, sender, **kw: (
            hook.on_message(msg, sender), orig(msg, sender, **kw)
        )[-1]

        user.initiate_chat(assistant, message="Start pipeline")
        result = hook.submit()
        print(result["summary"])
    """

    def __init__(self, client: BlackboxClient, goal: str = ""):
        self.client = client
        self._builder = TraceBuilder(agent_id="autogen", goal=goal)
        self._result: dict[str, Any] | None = None

    def on_message(self, message: dict[str, Any] | str, sender: Any = None) -> None:
        agent_id = getattr(sender, "name", "agent") if sender else "agent"
        if isinstance(message, str):
            self._builder.message(message[:200], actor=agent_id)
        elif isinstance(message, dict):
            content = message.get("content", "")
            tool_calls = message.get("tool_calls", [])
            if content:
                self._builder.message(str(content)[:200], actor=agent_id)
            for tc in tool_calls or []:
                fn = tc.get("function", {})
                try:
                    args = json.loads(fn.get("arguments", "{}") or "{}")
                except Exception:
                    args = {}
                self._builder.tool_call(fn.get("name", "tool"), args, actor=agent_id)
            tool_responses = message.get("tool_responses", [])
            for tr in tool_responses or []:
                self._builder.tool_result(
                    tr.get("tool_call_id", "tool"),
                    output=tr.get("content"),
                    actor=agent_id,
                )

    def submit(self) -> dict[str, Any]:
        self._result = self.client.ingest(self._builder.to_jsonl())
        return self._result

    @property
    def investigation_result(self) -> dict[str, Any] | None:
        return self._result
