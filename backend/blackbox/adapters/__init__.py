"""Input adapters that convert source traces into Flight Records."""

from blackbox.adapters.generic_jsonl import TraceFormatError, normalize_jsonl

__all__ = ["TraceFormatError", "normalize_jsonl"]
