"""Generic Python decorator and context manager for tracing any agent function."""
from __future__ import annotations

import functools
from contextlib import contextmanager
from typing import Any, Callable, Generator

from blackbox_client.client import BlackboxClient
from blackbox_client.trace import TraceBuilder


def trace(
    client: BlackboxClient,
    *,
    goal: str = "",
    agent_id: str = "agent",
) -> Callable[..., Any]:
    """Decorator: wraps a function and submits its steps to Blackbox on return.

    The decorated function receives a ``_trace: TraceBuilder`` keyword argument.

    Usage::

        from blackbox_client import BlackboxClient
        from blackbox_client.adapters.generic import trace

        bb = BlackboxClient(api_key="bb_live_...")

        @trace(bb, goal="Process refund", agent_id="refund-bot")
        def handle_refund(order_id: str, *, _trace: TraceBuilder):
            _trace.tool_call("get_order", {"order_id": order_id})
            order = get_order(order_id)
            _trace.tool_result("get_order", output=order)
            ...
    """

    def decorator(fn: Callable[..., Any]) -> Callable[..., Any]:
        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            builder = TraceBuilder(agent_id=agent_id, goal=goal)
            kwargs["_trace"] = builder
            result = fn(*args, **kwargs)
            try:
                client.ingest(builder.to_jsonl())
            except Exception:
                pass
            return result

        return wrapper

    return decorator


@contextmanager
def capture(
    client: BlackboxClient,
    *,
    goal: str = "",
    agent_id: str = "agent",
) -> Generator[TraceBuilder, None, None]:
    """Context manager: yields a TraceBuilder; submits the trace on exit.

    Usage::

        from blackbox_client import BlackboxClient
        from blackbox_client.adapters.generic import capture

        bb = BlackboxClient(api_key="bb_live_...")

        with capture(bb, goal="Place delivery order", agent_id="order-bot") as t:
            t.message("User requested order from SpiceRoute")
            t.tool_call("place_order", {"customer_id": "cust_001", "restaurant_id": "rest_001"})
            result = place_order(customer_id="cust_001", restaurant_id="rest_001")
            t.tool_result("place_order", output=result)
        # trace submitted automatically on exit
    """
    builder = TraceBuilder(agent_id=agent_id, goal=goal)
    yield builder
    try:
        client.ingest(builder.to_jsonl())
    except Exception:
        pass
