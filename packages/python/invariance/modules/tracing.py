from __future__ import annotations

import warnings
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule


class TracingModule:
    def __init__(
        self, resources: ResourcesModule, agent: str | None = None
    ) -> None:
        self._resources = resources
        self._default_agent = agent

    async def submit(self, events: dict[str, Any] | list[dict[str, Any]]) -> Any:
        payload = events if isinstance(events, list) else [events]
        return await self._resources.trace.submit_events(payload)

    async def log_context(
        self,
        label: str,
        value: Any,
        *,
        session_id: str,
        agent_id: str | None = None,
        parent_id: str | None = None,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        """Log a context trace event — the simplest way to attach data to a session."""
        resolved_agent_id = agent_id or self._default_agent
        if not resolved_agent_id:
            raise ValueError(
                "agent_id is required: pass it to tracing.log_context() or set agent in the Invariance config"
            )
        event: dict[str, Any] = {
            "session_id": session_id,
            "agent_id": resolved_agent_id,
            "action_type": "context",
            "input": {"label": label},
            "output": {"value": value},
        }
        if parent_id:
            event["parent_id"] = parent_id
        if custom_attributes:
            event["custom_attributes"] = custom_attributes
        if custom_headers:
            event["custom_headers"] = custom_headers
        if tags:
            event["metadata"] = {"tags": tags}
        return await self._resources.trace.submit_events([event])

    async def context(
        self,
        label: str,
        value: Any,
        *,
        session_id: str,
        agent_id: str | None = None,
        parent_id: str | None = None,
        tags: list[str] | None = None,
        custom_attributes: dict[str, Any] | None = None,
        custom_headers: dict[str, str] | None = None,
    ) -> Any:
        """.. deprecated:: Use ``log_context()`` instead."""
        warnings.warn(
            "tracing.context() is deprecated. Use tracing.log_context() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        return await self.log_context(
            label, value,
            session_id=session_id, agent_id=agent_id, parent_id=parent_id,
            tags=tags, custom_attributes=custom_attributes,
            custom_headers=custom_headers,
        )

    async def log(self, label: str, value: Any, **kwargs: Any) -> Any:
        """.. deprecated:: Use ``log_context()`` instead."""
        warnings.warn(
            "tracing.log() is deprecated. Use tracing.log_context() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        return await self.log_context(label, value, **kwargs)

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
