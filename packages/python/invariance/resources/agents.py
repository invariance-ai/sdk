from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import AgentRecord, AgentMetrics, AgentActionTemplate, AgentActionPolicy


class AgentsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def create(self, opts: dict[str, str]) -> AgentRecord:
        return await self._http.post("/v1/agents", opts)

    async def list(self) -> list[AgentRecord]:
        return await self._http.get("/v1/agents")

    async def get(self, id: str) -> AgentRecord:
        return await self._http.get(f"/v1/agents/{id}")

    async def metrics(self) -> dict[str, Any]:
        return await self._http.get("/v1/agents/metrics")

    async def upsert_templates(
        self, agent_id: str, templates: list[AgentActionTemplate]
    ) -> dict[str, int]:
        return await self._http.put(
            f"/v1/agents/{agent_id}/templates", {"templates": templates}
        )

    async def get_templates(self, agent_id: str) -> list[AgentActionTemplate]:
        return await self._http.get(f"/v1/agents/{agent_id}/templates")

    async def upsert_policies(
        self, agent_id: str, policies: list[AgentActionPolicy]
    ) -> dict[str, int]:
        return await self._http.put(
            f"/v1/agents/{agent_id}/policies", {"policies": policies}
        )

    async def get_policies(self, agent_id: str) -> list[AgentActionPolicy]:
        return await self._http.get(f"/v1/agents/{agent_id}/policies")
