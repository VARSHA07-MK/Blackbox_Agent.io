"""LangChain callback handler that captures chain/agent runs as Blackbox traces."""
from __future__ import annotations

import json
from typing import Any

try:
    from langchain_core.callbacks.base import BaseCallbackHandler

    _LANGCHAIN_AVAILABLE = True
except ImportError:
    _LANGCHAIN_AVAILABLE = False
    BaseCallbackHandler = object  # type: ignore[misc,assignment]

from blackbox_client.client import BlackboxClient
from blackbox_client.trace import TraceBuilder


class BlackboxLangChainHandler(BaseCallbackHandler):
    """Attach to any LangChain chain/agent to auto-submit traces to Blackbox.

    Usage::

        from blackbox_client import BlackboxClient
        from blackbox_client.adapters.langchain import BlackboxLangChainHandler

        client = BlackboxClient(api_key="bb_live_...")
        handler = BlackboxLangChainHandler(client, goal="Customer support query")

        chain.invoke({"input": "..."}, config={"callbacks": [handler]})
        # trace auto-submitted on chain end; check handler.investigation_result
    """

    def __init__(self, client: BlackboxClient, goal: str = "", agent_id: str = "langchain-agent"):
        if not _LANGCHAIN_AVAILABLE:
            raise ImportError("langchain-core is required: pip install langchain-core")
        self.client = client
        self._builder = TraceBuilder(agent_id=agent_id, goal=goal)
        self._result: dict[str, Any] | None = None

    def on_llm_start(self, serialized: dict[str, Any], prompts: list[str], **kwargs: Any) -> None:
        model = serialized.get("name", "llm")
        self._builder.message(f"LLM call: {model} — {prompts[0][:120] if prompts else ''}")

    def on_llm_end(self, response: Any, **kwargs: Any) -> None:
        text = ""
        try:
            text = response.generations[0][0].text[:200]
        except Exception:
            pass
        self._builder.message(f"LLM response: {text}")

    def on_tool_start(self, serialized: dict[str, Any], input_str: str, **kwargs: Any) -> None:
        tool_name = serialized.get("name", "tool")
        try:
            args = json.loads(input_str)
        except Exception:
            args = {"input": input_str}
        self._builder.tool_call(tool_name, args)

    def on_tool_end(self, output: str, **kwargs: Any) -> None:
        last_tc = next(
            (s for s in reversed(self._builder._steps) if s.get("kind") == "tool_call"), None
        )
        tool_name = last_tc["tool_call"]["tool"] if last_tc else "tool"
        try:
            out = json.loads(output)
        except Exception:
            out = output
        self._builder.tool_result(tool_name, output=out)

    def on_tool_error(self, error: Exception, **kwargs: Any) -> None:
        last_tc = next(
            (s for s in reversed(self._builder._steps) if s.get("kind") == "tool_call"), None
        )
        tool_name = last_tc["tool_call"]["tool"] if last_tc else "tool"
        self._builder.tool_result(tool_name, error=str(error))

    def on_chain_end(self, outputs: dict[str, Any], **kwargs: Any) -> None:
        self._builder.message(f"Chain completed: {str(outputs)[:120]}")
        try:
            self._result = self.client.ingest(self._builder.to_jsonl())
        except Exception as exc:
            self._result = {"error": str(exc)}

    @property
    def investigation_result(self) -> dict[str, Any] | None:
        return self._result
