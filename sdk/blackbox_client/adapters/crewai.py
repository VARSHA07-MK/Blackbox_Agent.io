"""CrewAI task/crew callback adapter."""
from __future__ import annotations

from typing import Any

from blackbox_client.client import BlackboxClient
from blackbox_client.trace import TraceBuilder


class BlackboxCrewCallback:
    """Attach to a CrewAI crew to capture task execution traces.

    Usage::

        from crewai import Crew
        from blackbox_client import BlackboxClient
        from blackbox_client.adapters.crewai import BlackboxCrewCallback

        bb = BlackboxClient(api_key="bb_live_...")
        callback = BlackboxCrewCallback(bb, goal="Research and write blog post")
        crew = Crew(agents=[...], tasks=[...], step_callback=callback.on_step)
        crew.kickoff()
        result = callback.submit()
        print(result["summary"])
    """

    def __init__(self, client: BlackboxClient, goal: str = "", agent_id: str = "crewai-agent"):
        self.client = client
        self._builder = TraceBuilder(agent_id=agent_id, goal=goal)
        self._result: dict[str, Any] | None = None

    def on_step(self, step: Any) -> None:
        """Called by CrewAI after each agent step."""
        tool = getattr(step, "tool", None)
        tool_input = getattr(step, "tool_input", None)
        observation = getattr(step, "observation", None)
        thought = getattr(step, "thought", None)

        if thought:
            self._builder.decision(str(thought)[:200])
        if tool:
            self._builder.tool_call(str(tool), {"input": str(tool_input or "")})
        if observation is not None:
            last_tc = next(
                (s for s in reversed(self._builder._steps) if s.get("kind") == "tool_call"), None
            )
            tool_name = last_tc["tool_call"]["tool"] if last_tc else "tool"
            self._builder.tool_result(tool_name, output=str(observation)[:300])

    def submit(self) -> dict[str, Any]:
        """Submit the captured trace to Blackbox. Call after crew.kickoff()."""
        self._result = self.client.ingest(self._builder.to_jsonl())
        return self._result

    @property
    def investigation_result(self) -> dict[str, Any] | None:
        return self._result
