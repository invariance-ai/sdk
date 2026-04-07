from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.query import QueryResource
    from ..resources.nl_query import NLQueryResource
    from ..resources.drift import DriftResource
    from ..resources.search import SearchResource
    from ..resources.usage import UsageResource


class AnalysisModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    @property
    def query(self) -> QueryResource:
        return self._resources.query

    @property
    def nl_query(self) -> NLQueryResource:
        return self._resources.nl_query

    @property
    def drift(self) -> DriftResource:
        return self._resources.drift

    @property
    def search(self) -> SearchResource:
        return self._resources.search

    @property
    def usage(self) -> UsageResource:
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
