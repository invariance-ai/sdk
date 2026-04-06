from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule


class TracingModule:
    def __init__(
        self, resources: ResourcesModule, agent: str | None = None
    ) -> None:
        self._resources = resources
        self._default_agent = agent

    async def submit(self, events: list[dict[str, Any]]) -> Any:
        return await self._resources.trace.submit_events(events)

    async def context(
        self,
        label: str,
        value: Any,
        *,
        session_id: str,
        agent_id: str | None = None,
        parent_id: str | None = None,
        tags: list[str] | None = None,
    ) -> Any:
        event: dict[str, Any] = {
            "session_id": session_id,
            "agent_id": agent_id or self._default_agent or "",
            "action_type": "context",
            "input": {"label": label},
            "output": {"value": value},
        }
        if parent_id:
            event["parent_id"] = parent_id
        if tags:
            event["metadata"] = {"tags": tags}
        return await self._resources.trace.submit_events([event])

    async def log(self, label: str, value: Any, **kwargs: Any) -> Any:
        return await self.context(label, value, **kwargs)

    async def replay(self, session_id: str) -> Any:
        return await self._resources.trace.get_replay(session_id)

    async def audit(
        self, session_id: str, node_id: str | None = None
    ) -> Any:
        return await self._resources.trace.generate_audit(session_id, node_id)

    async def graph(self, session_id: str | None = None) -> Any:
        return await self._resources.trace.get_graph_snapshot(
            session_id=session_id
        )

    async def narrative(self, session_id: str) -> Any:
        return await self._resources.trace.get_narrative(session_id)

    async def semantic_facts(self, session_id: str) -> Any:
        return await self._resources.trace.get_session_semantic_facts(
            session_id
        )

    async def verify(self, session_id: str) -> Any:
        return await self._resources.trace.verify_chain(session_id)
