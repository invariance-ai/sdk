from __future__ import annotations

import time
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


class InvarianceLangChainHandler:
    """LangChain callback handler that records tool calls and LLM invocations
    as Invariance receipts and trace events with proper behavioral primitives."""

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
        self._active_tool: dict[str, Any] | None = None

    def _get_session(self) -> Session:
        if self._session is None:
            self._session = self._client.session(
                agent=self._agent, name=self._session_name
            )
        return self._session

    async def handle_llm_start(
        self, llm: dict[str, Any], prompts: list[str]
    ) -> None:
        session = self._get_session()
        await session.record(
            {"action": "llm_start", "input": {"llm": llm.get("name"), "prompts": prompts}}
        )
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "context_window",
            input={"label": f"llm:{llm.get('name', 'unknown')}", "model": llm.get("name", "unknown"), "prompt_count": len(prompts)},
        ))

    async def handle_llm_end(self, output: Any) -> None:
        session = self._get_session()
        await session.record(
            {"action": "llm_end", "input": {}, "output": {"result": output}}
        )
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "trace_step",
            input={"step": "llm_end"},
            output=output if isinstance(output, dict) else {"result": output},
        ))

    async def handle_tool_start(self, tool: dict[str, Any], input: str) -> None:
        session = self._get_session()
        self._active_tool = {
            "name": tool.get("name", "unknown"),
            "input": input,
            "started_at": time.time(),
        }
        await session.record(
            {"action": "tool_start", "input": {"tool": tool.get("name"), "input": input}}
        )
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "tool_invocation",
            input={"tool": tool.get("name", "unknown"), "args": {"input": input}},
            metadata={"tool_calls": [tool.get("name", "unknown")]},
        ))

    async def handle_tool_end(self, output: str) -> None:
        session = self._get_session()
        active_tool = self._active_tool
        self._active_tool = None
        await session.record(
            {"action": "tool_end", "input": {}, "output": {"result": output}}
        )
        latency_ms = None
        if active_tool:
            latency_ms = int((time.time() - active_tool["started_at"]) * 1000)
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "tool_invocation",
            input={
                "tool": active_tool["name"] if active_tool else "unknown",
                "args": {"input": active_tool["input"]} if active_tool else None,
            },
            output={"result": output},
            metadata={
                "tool_calls": [active_tool["name"] if active_tool else "unknown"],
                **({"execution_ms": latency_ms} if latency_ms is not None else {}),
            },
        ))

    async def handle_chain_start(
        self, chain: dict[str, Any], inputs: Any
    ) -> None:
        session = self._get_session()
        await session.record(
            {"action": "chain_start", "input": {"chain": chain.get("name"), "inputs": inputs}}
        )
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "trace_step",
            input={"step": f"chain:{chain.get('name', 'unknown')}", "inputs": inputs},
        ))

    async def handle_chain_end(self, outputs: Any) -> None:
        session = self._get_session()
        await session.record(
            {"action": "chain_end", "input": {}, "output": {"result": outputs}}
        )

    async def handle_error(self, error: Exception) -> None:
        session = self._get_session()
        await session.record(
            {"action": "error", "input": {}, "error": str(error)}
        )
        await self._client.tracing.submit(_trace_event(
            session.id, self._agent, "trace_step",
            input={"step": "error"}, error=str(error),
        ))

    async def end(self) -> None:
        if self._session:
            await self._session.end()
            self._session = None
