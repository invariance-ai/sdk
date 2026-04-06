from __future__ import annotations

from typing import Any

from ..client import Invariance
from ..session import Session


class InvarianceCrewAIAdapter:
    """CrewAI adapter that records crew task executions as Invariance receipts."""

    def __init__(
        self,
        *,
        client: Invariance,
        agent: str,
        session_name: str | None = None,
    ) -> None:
        self._client = client
        self._agent = agent
        self._session: Session | None = None
        self._session_name = session_name or "crewai-run"

    def _get_session(self) -> Session:
        if self._session is None:
            self._session = self._client.session(
                agent=self._agent, name=self._session_name
            )
        return self._session

    async def on_task_start(self, task: dict[str, Any]) -> None:
        await self._get_session().record({
            "action": "crew_task_start",
            "input": {
                "description": task.get("description"),
                "assigned_agent": task.get("agent"),
            },
        })

    async def on_task_end(self, task: dict[str, Any], output: Any) -> None:
        await self._get_session().record({
            "action": "crew_task_end",
            "input": {"description": task.get("description")},
            "output": {"result": output},
        })

    async def on_tool_use(
        self, tool: str, input: Any, output: Any
    ) -> None:
        await self._get_session().record({
            "action": "crew_tool_use",
            "input": {"tool": tool, "tool_input": input},
            "output": {"result": output},
        })

    async def on_delegation(
        self, from_agent: str, to_agent: str, task: str
    ) -> None:
        await self._get_session().record({
            "action": "crew_delegation",
            "input": {"from": from_agent, "to": to_agent, "task": task},
        })

    async def end(self) -> None:
        if self._session:
            await self._session.end()
            self._session = None
