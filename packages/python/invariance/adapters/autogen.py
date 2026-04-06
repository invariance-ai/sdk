from __future__ import annotations

from typing import Any

from ..client import Invariance
from ..session import Session


class InvarianceAutoGenAdapter:
    """AutoGen adapter that records multi-agent conversations as Invariance receipts."""

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
        await self._get_session().record({
            "action": "autogen_message",
            "input": {"from": from_agent, "to": to_agent, "content": content},
        })

    async def on_function_call(
        self, caller: str, function_name: str, args: Any
    ) -> None:
        await self._get_session().record({
            "action": "autogen_function_call",
            "input": {"caller": caller, "function": function_name, "arguments": args},
        })

    async def on_function_result(
        self, function_name: str, result: Any
    ) -> None:
        await self._get_session().record({
            "action": "autogen_function_result",
            "input": {"function": function_name},
            "output": {"result": result},
        })

    async def on_conversation_end(self, summary: str | None = None) -> None:
        await self._get_session().record({
            "action": "autogen_conversation_end",
            "input": {"summary": summary or ""},
        })

    async def end(self) -> None:
        if self._session:
            await self._session.end()
            self._session = None
