from __future__ import annotations

from typing import Any

from ..client import Invariance
from ..session import Session


class InvarianceLangChainHandler:
    """LangChain callback handler that records tool calls and LLM invocations
    as Invariance receipts."""

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
        self._session_name = session_name or "langchain-run"

    def _get_session(self) -> Session:
        if self._session is None:
            self._session = self._client.session(
                agent=self._agent, name=self._session_name
            )
        return self._session

    async def handle_llm_start(
        self, llm: dict[str, Any], prompts: list[str]
    ) -> None:
        await self._get_session().record(
            {"action": "llm_start", "input": {"llm": llm.get("name"), "prompts": prompts}}
        )

    async def handle_llm_end(self, output: Any) -> None:
        await self._get_session().record(
            {"action": "llm_end", "input": {}, "output": {"result": output}}
        )

    async def handle_tool_start(self, tool: dict[str, Any], input: str) -> None:
        await self._get_session().record(
            {"action": "tool_start", "input": {"tool": tool.get("name"), "input": input}}
        )

    async def handle_tool_end(self, output: str) -> None:
        await self._get_session().record(
            {"action": "tool_end", "input": {}, "output": {"result": output}}
        )

    async def handle_chain_start(
        self, chain: dict[str, Any], inputs: Any
    ) -> None:
        await self._get_session().record(
            {"action": "chain_start", "input": {"chain": chain.get("name"), "inputs": inputs}}
        )

    async def handle_chain_end(self, outputs: Any) -> None:
        await self._get_session().record(
            {"action": "chain_end", "input": {}, "output": {"result": outputs}}
        )

    async def handle_error(self, error: Exception) -> None:
        await self._get_session().record(
            {"action": "error", "input": {}, "error": str(error)}
        )

    async def end(self) -> None:
        if self._session:
            await self._session.end()
            self._session = None
