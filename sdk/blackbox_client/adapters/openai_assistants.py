"""Adapter for OpenAI Assistants API — wraps a thread run stream and captures events."""
from __future__ import annotations

from typing import Any

from blackbox_client.client import BlackboxClient
from blackbox_client.trace import TraceBuilder


def capture_assistant_run(
    client_or_stream: Any,
    *,
    blackbox: BlackboxClient,
    goal: str = "",
    agent_id: str = "openai-assistant",
) -> dict[str, Any]:
    """Wrap an OpenAI assistant run stream and submit the trace to Blackbox.

    Usage::

        import openai
        from blackbox_client import BlackboxClient
        from blackbox_client.adapters.openai_assistants import capture_assistant_run

        oai = openai.OpenAI()
        bb = BlackboxClient(api_key="bb_live_...")

        with oai.beta.threads.runs.stream(
            thread_id=thread.id,
            assistant_id=assistant.id,
        ) as stream:
            result = capture_assistant_run(stream, blackbox=bb, goal="Handle support ticket")

        print(result["summary"])
    """
    builder = TraceBuilder(agent_id=agent_id, goal=goal)
    builder.message(f"Assistant run started. Goal: {goal}")

    try:
        for event in client_or_stream:
            event_type = getattr(event, "event", "")
            if event_type == "thread.run.step.created":
                builder.decision(f"Run step created: {getattr(event.data, 'type', '')}")
            elif event_type == "thread.run.step.delta":
                delta = getattr(event.data, "delta", None)
                if delta:
                    step_details = getattr(delta, "step_details", None)
                    if step_details and getattr(step_details, "type", "") == "tool_calls":
                        for tc in getattr(step_details, "tool_calls", []):
                            fn = getattr(tc, "function", None)
                            if fn:
                                try:
                                    import json
                                    args = json.loads(getattr(fn, "arguments", "{}") or "{}")
                                except Exception:
                                    args = {}
                                builder.tool_call(getattr(fn, "name", "tool"), args)
            elif event_type == "thread.run.requires_action":
                builder.message("Run requires action — tool outputs needed")
            elif event_type == "thread.message.delta":
                delta = getattr(event.data, "delta", None)
                content = getattr(delta, "content", []) if delta else []
                text = "".join(
                    getattr(getattr(c, "text", None), "value", "") for c in (content or [])
                )
                if text:
                    builder.message(f"Assistant: {text[:200]}")
            elif event_type == "thread.run.completed":
                builder.message("Run completed")
            elif event_type == "thread.run.failed":
                builder.message(f"Run failed: {getattr(event.data, 'last_error', '')}")
    except Exception as exc:
        builder.message(f"Stream error: {exc}")

    return blackbox.ingest(builder.to_jsonl())
