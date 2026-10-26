"""Synchronous Blackbox client."""
from __future__ import annotations

import httpx
from typing import Any


class BlackboxClient:
    def __init__(self, base_url: str = "http://localhost:8000", api_key: str = ""):
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key

    def _headers(self) -> dict[str, str]:
        h = {"Content-Type": "application/json"}
        if self.api_key:
            h["Authorization"] = f"Bearer {self.api_key}"
        return h

    def ingest(
        self,
        trace: str | dict[str, Any],
        *,
        source_format: str = "generic-jsonl",
        task: dict[str, Any] | None = None,
        record_id: str | None = None,
    ) -> dict[str, Any]:
        """Submit a trace for analysis. Returns the full investigation result."""
        resp = httpx.post(
            f"{self.base_url}/v1/ingest",
            headers=self._headers(),
            json={
                "source_format": source_format,
                "trace": trace,
                "task": task,
                "record_id": record_id,
            },
            timeout=30,
        )
        resp.raise_for_status()
        return resp.json()  # type: ignore[no-any-return]

    def get_investigation(self, investigation_id: str) -> dict[str, Any]:
        resp = httpx.get(
            f"{self.base_url}/v1/investigations/{investigation_id}",
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()  # type: ignore[no-any-return]

    def list_investigations(self) -> list[dict[str, Any]]:
        resp = httpx.get(
            f"{self.base_url}/v1/investigations",
            headers=self._headers(),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json().get("investigations", [])  # type: ignore[no-any-return]
