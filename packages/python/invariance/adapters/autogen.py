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


class InvarianceAutoGenAdapter:
    """AutoGen adapter that records multi-agent conversations as Invariance receipts
    and trace events with proper behavioral primitives (a2a_send for messages,
    tool_invocation for function calls)."""

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
        self._session_name = session_name or "autogen-run"

    def _get_session(self) -> Session:
        if self._session is None:
            self._session = self._client.session(
                agent=self._agent, name=self._session_name
            )
        return self._session

    async def on_message_sent(
        self, from_agent: str, to_agent: str, content: str
    ) -> None:
        """Record an inter-agent message as an a2a_send trace event."""
        session = self._get_session()
        await session.record({
            "action": "autogen_message",
            "input": {"from": from_agent, "to": to_agent, "content": content},
        })
        await self._client.tracing.submit(_trace_event(
            session.id, from_agent, "a2a_send",
            input={"to": to_agent, "content": content},
        ))

    async def on_function_call(
        self, caller: str, function_name: str, args: Any
    ) -> None:
        """Record a function call as a tool_invocation trace event."""
        session = self._get_session()
        await session.record({
            "action": "autogen_function_call",
            "input": {"caller": caller, "function": function_name, "arguments": args},
        })
        await self._client.tracing.submit(_trace_event(
            session.id, caller, "tool_invocation",
            input={"tool": function_name, "args": args},
            metadata={"tool_calls": [function_name]},
        ))

    async def on_function_result(
        self, function_name: str, result: Any
    ) -> None:
        session = self._get_session()
        await session.record({
            "action": "autogen_function_result",
            "input": {"function": function_name},
            "output": {"result": result},
        })

    async def on_conversation_end(self, summary: str | None = None) -> None:
        session = self._get_session()
        await session.record({
            "action": "autogen_conversation_end",
            "input": {"summary": summary or ""},
        })
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "trace_step",
            input={"step": "conversation_end", "summary": summary},
        ))

    async def end(self) -> None:
        if self._session:
            await self._session.end()
            self._session = None
