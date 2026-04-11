from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import (
    TraceNode, TraceEventInput, ReplayTimelineEntry, ReplaySnapshot,
    CausalChain, AnomalyQuery, CounterfactualRequest, CounterfactualResult,
    AuditResult, GraphPattern, PatternQuery, GraphSnapshot, NodeDiff,
)


class TraceResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def submit_events(
        self, events: TraceEventInput | list[TraceEventInput]
    ) -> dict[str, Any]:
        payload = events if isinstance(events, list) else [events]
        return await self._http.post("/v1/trace/events", payload)

    async def submit_behaviors(self, behaviors: Any) -> dict[str, bool]:
        return await self._http.post("/v1/trace/behaviors", behaviors)

    async def get_session_nodes(self, session_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{session_id}/nodes")

    async def get_session_summary(self, session_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{session_id}/summary")

    async def get_session_handoffs(self, session_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{session_id}/handoffs")

    async def get_session_signals(self, session_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{session_id}/signals")

    async def get_session_proof(self, session_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{session_id}/proof")

    async def get_replay(self, session_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{session_id}/replay")

    async def get_node_snapshot(self, node_id: str) -> ReplaySnapshot:
        return await self._http.get(f"/v1/trace/nodes/{node_id}/snapshot")

    async def get_causal_chain(self, node_id: str) -> CausalChain:
        return await self._http.get(f"/v1/trace/nodes/{node_id}/causal-chain")

    async def diff_nodes(self, node_id_a: str, node_id_b: str) -> NodeDiff:
        return await self._http.get(
            f"/v1/trace/nodes/{node_id_a}/diff/{node_id_b}"
        )

    async def get_dependency_context(self, node_id: str) -> Any:
        return await self._http.get(
            f"/v1/trace/nodes/{node_id}/dependency-context"
        )

    async def get_anomalies(
        self, opts: AnomalyQuery | None = None
    ) -> dict[str, Any]:
        params: dict[str, Any] | None = None
        if opts:
            params = {
                "minScore": opts.get("minScore"),
                "limit": opts.get("limit"),
                "offset": opts.get("offset"),
                "agentId": opts.get("agentId"),
                "sessionId": opts.get("sessionId"),
                "since": opts.get("since"),
                "until": opts.get("until"),
            }
        return await self._http.get("/v1/trace/anomalies", params=params)

    async def generate_replay(
        self, session_id: str, opts: CounterfactualRequest
    ) -> CounterfactualResult:
        return await self._http.post(
            f"/v1/trace/sessions/{session_id}/generate-replay", opts
        )

    async def generate_audit(
        self, session_id: str, node_id: str | None = None
    ) -> AuditResult:
        return await self._http.post(
            f"/v1/trace/sessions/{session_id}/generate-audit",
            {"node_id": node_id},
        )

    async def get_patterns(
        self, opts: PatternQuery | None = None
    ) -> dict[str, Any]:
        params: dict[str, Any] | None = None
        if opts:
            params = {
                "agentId": opts.get("agentId"),
                "actionType": opts.get("actionType"),
                "limit": opts.get("limit"),
                "since": opts.get("since"),
                "until": opts.get("until"),
            }
        return await self._http.get("/v1/trace/graph/patterns", params=params)

    async def get_graph_snapshot(
        self, opts: dict[str, str] | None = None
    ) -> GraphSnapshot:
        params: dict[str, Any] | None = None
        if opts:
            params = {"sessionId": opts.get("sessionId")}
        return await self._http.get("/v1/trace/graph/snapshot", params=params)

    async def get_narrative(self, session_id: str) -> dict[str, Any]:
        return await self._http.get(
            f"/v1/trace/sessions/{session_id}/narrative"
        )

    async def verify_chain(self, session_id: str) -> dict[str, Any]:
        payload = await self._http.get(
            f"/v1/trace/sessions/{session_id}/verify"
        )
        if isinstance(payload, dict):
            if isinstance(payload.get("verified"), bool):
                return {
                    "verified": payload["verified"],
                    "errors": [
                        item for item in payload.get("errors", [])
                        if isinstance(item, str)
                    ],
                }
            if isinstance(payload.get("valid"), bool):
                return {
                    "verified": payload["valid"],
                    "errors": [payload["error"]]
                    if isinstance(payload.get("error"), str)
                    else [],
                }
        return {"verified": False, "errors": ["Invalid verification response"]}

    # ── Ontology Graph ──

    async def get_ontology_nodes(
        self, *, graph_domain: str | None = None, node_type: str | None = None,
        search: str | None = None, min_score: float | None = None,
        limit: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if graph_domain: params["graph_domain"] = graph_domain
        if node_type: params["node_type"] = node_type
        if search: params["search"] = search
        if min_score is not None: params["min_score"] = min_score
        if limit is not None: params["limit"] = limit
        return await self._http.get("/v1/trace/ontology/nodes", params=params)

    async def get_ontology_node(self, node_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/ontology/nodes/{node_id}")

    async def get_ontology_neighborhood(
        self, node_id: str, depth: int = 1,
    ) -> dict[str, Any]:
        return await self._http.get(
            f"/v1/trace/ontology/nodes/{node_id}/neighborhood",
            params={"depth": depth},
        )

    async def get_ontology_node_evidence(self, node_id: str) -> dict[str, Any]:
        return await self._http.get(
            f"/v1/trace/ontology/nodes/{node_id}/evidence"
        )

    async def get_ontology_edges(
        self, *, graph_domain: str | None = None, edge_type: str | None = None,
        min_score: float | None = None, limit: int | None = None,
    ) -> dict[str, Any]:
        params: dict[str, Any] = {}
        if graph_domain: params["graph_domain"] = graph_domain
        if edge_type: params["edge_type"] = edge_type
        if min_score is not None: params["min_score"] = min_score
        if limit is not None: params["limit"] = limit
        return await self._http.get("/v1/trace/ontology/edges", params=params)

    async def get_ontology_edge_evidence(self, edge_id: str) -> dict[str, Any]:
        return await self._http.get(
            f"/v1/trace/ontology/edges/{edge_id}/evidence"
        )

    async def get_ontology_graph_snapshot(
        self, domain: str = "linked",
    ) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/ontology/graph/{domain}")
