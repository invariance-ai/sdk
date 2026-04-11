from __future__ import annotations

from typing import Any

from ..client import Invariance
from ..session import Session


def _trace_event(
    session_id: str, agent_id: str, action_type: str, **kwargs: Any
) -> dict[str, Any]:
    event: dict[str, Any] = {
        "session_id": session_id,
        "agent_id": agent_id,
        "action_type": action_type,
    }
    for key in ("input", "output", "error", "metadata"):
        if key in kwargs and kwargs[key] is not None:
            event[key] = kwargs[key]
    return event


class InvarianceCrewAIAdapter:
    """CrewAI adapter that records crew task executions as Invariance receipts
    and trace events with proper behavioral primitives."""

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
        session = self._get_session()
        await session.record({
            "action": "crew_task_start",
            "input": {
                "description": task.get("description"),
                "assigned_agent": task.get("agent"),
            },
        })
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "trace_step",
            input={"step": "crew_task_start", "description": task.get("description"), "assigned_agent": task.get("agent")},
        ))

    async def on_task_end(self, task: dict[str, Any], output: Any) -> None:
        session = self._get_session()
        await session.record({
            "action": "crew_task_end",
            "input": {"description": task.get("description")},
            "output": {"result": output},
        })
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "trace_step",
            input={"step": "crew_task_end", "description": task.get("description")},
            output=output if isinstance(output, dict) else {"result": output},
        ))

    async def on_tool_use(
        self, tool: str, input: Any, output: Any
    ) -> None:
        session = self._get_session()
        await session.record({
            "action": "crew_tool_use",
            "input": {"tool": tool, "tool_input": input},
            "output": {"result": output},
        })
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "tool_invocation",
            input={"tool": tool, "args": input},
            output=output if isinstance(output, dict) else {"result": output},
            metadata={"tool_calls": [tool]},
        ))

    async def on_delegation(
        self, from_agent: str, to_agent: str, task: str
    ) -> None:
        """Record a CrewAI delegation as a handoff (sub_agent_spawn) trace event."""
        session = self._get_session()
        await session.record({
            "action": "crew_delegation",
            "input": {"from": from_agent, "to": to_agent, "task": task},
        })
        await self._client.tracing.submit(_trace_event(
            session.id, from_agent, "sub_agent_spawn",
            input={"target_agent_id": to_agent, "task": task},
        ))

    async def end(self) -> None:
        if self._session:
            await self._session.end()
            self._session = None
