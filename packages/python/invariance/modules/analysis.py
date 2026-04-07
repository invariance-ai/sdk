from __future__ import annotations

from typing import TYPE_CHECKING, Any, Optional

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.query import QueryResource
    from ..resources.nl_query import NLQueryResource
    from ..resources.drift import DriftResource
    from ..resources.search import SearchResource
    from ..resources.usage import UsageResource
    from ..resources.status import StatusResource
    from ..resources.trace import TraceResource


class _SearchAccessor:
    """Natural language and global search across agent data."""

    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    @property
    def nl(self) -> NLQueryResource:
        """Natural language query interface."""
        return self._resources.nl_query

    @property
    def global_(self) -> SearchResource:
        """Global search across sessions and agents."""
        return self._resources.search


class _ReplayAccessor:
    """Session replay and timeline analysis."""

    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    async def timeline(self, session_id: str) -> dict[str, Any]:
        return await self._resources.trace.get_replay(session_id)

    async def snapshot(self, node_id: str) -> Any:
        return await self._resources.trace.get_node_snapshot(node_id)


class _AuditAccessor:
    """Audit trail generation and verification."""

    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    async def generate(self, session_id: str, node_id: Optional[str] = None) -> Any:
        return await self._resources.trace.generate_audit(session_id, node_id)

    async def verify(self, session_id: str) -> dict[str, Any]:
        return await self._resources.trace.verify_chain(session_id)


class _GraphAccessor:
    """Semantic behavior graph queries and patterns."""

    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    async def snapshot(self, session_id: Optional[str] = None) -> Any:
        return await self._resources.trace.get_graph_snapshot(session_id=session_id)

    async def patterns(self, **kwargs: Any) -> Any:
        return await self._resources.trace.get_patterns(**kwargs)


class _LiveAccessor:
    """Real-time status and usage analytics."""

    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    @property
    def status(self) -> StatusResource:
        return self._resources.status

    @property
    def usage(self) -> UsageResource:
        return self._resources.usage


class AnalysisModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources
        self._search = _SearchAccessor(resources)
        self._replay = _ReplayAccessor(resources)
        self._audit = _AuditAccessor(resources)
        self._graph = _GraphAccessor(resources)
        self._live = _LiveAccessor(resources)

    # ── Product-facing capability names ──

    @property
    def query(self) -> QueryResource:
        """Semantic graph queries over agent behavior."""
        return self._resources.query

    @property
    def search(self) -> _SearchAccessor:
        """Natural language and global search across agent data."""
        return self._search

    @property
    def drift(self) -> DriftResource:
        """Drift detection and comparison between runs."""
        return self._resources.drift

    @property
    def replay(self) -> _ReplayAccessor:
        """Session replay and timeline analysis."""
        return self._replay

    @property
    def audit(self) -> _AuditAccessor:
        """Audit trail generation and verification."""
        return self._audit

    @property
    def graph(self) -> _GraphAccessor:
        """Semantic behavior graph queries and patterns."""
        return self._graph

    @property
    def live(self) -> _LiveAccessor:
        """Real-time status and usage analytics."""
        return self._live

    # ── Legacy aliases ──

    @property
    def nl_query(self) -> NLQueryResource:
        """Deprecated: use ``search.nl`` instead."""
        return self._resources.nl_query

    @property
    def usage(self) -> UsageResource:
        """Deprecated: use ``live.usage`` instead."""
        return self._resources.usage

    # ── Ontology Graph ──

    async def ontology_graph(self, domain: str = "linked") -> dict:
        """Get business or agent graph snapshot, or the linked view of both."""
        return await self._resources.trace.get_ontology_graph_snapshot(domain)

    async def ontology_nodes(self, **kwargs) -> dict:
        """Query ontology nodes with filters (domain, type, score, search)."""
        return await self._resources.trace.get_ontology_nodes(**kwargs)

    async def ontology_edges(self, **kwargs) -> dict:
        """Query ontology edges with filters."""
        return await self._resources.trace.get_ontology_edges(**kwargs)

    async def ontology_neighborhood(self, node_id: str, depth: int = 1) -> dict:
        """Get a node's neighborhood — connected nodes and edges within depth hops."""
        return await self._resources.trace.get_ontology_neighborhood(node_id, depth)

    async def ontology_evidence(self, node_id: str) -> dict:
        """Explain why a node was inferred — returns evidence links and aggregates."""
        return await self._resources.trace.get_ontology_node_evidence(node_id)
