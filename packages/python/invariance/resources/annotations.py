from __future__ import annotations

from typing import Any

from ..http_client import HttpClient


class AnnotationsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        status: str | None = None,
        target_type: str | None = None,
        agent_id: str | None = None,
        scorer_id: str | None = None,
        assigned_to: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if status:
            params["status"] = status
        if target_type:
            params["target_type"] = target_type
        if agent_id:
            params["agent_id"] = agent_id
        if scorer_id:
            params["scorer_id"] = scorer_id
        if assigned_to:
            params["assigned_to"] = assigned_to
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return await self._http.get("/v1/training/annotations", params=params)

    async def create(
        self, body: dict[str, Any] | list[dict[str, Any]]
    ) -> dict[str, Any] | list[dict[str, Any]]:
        return await self._http.post("/v1/training/annotations", body)

    async def update(self, id: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.patch(f"/v1/training/annotations/{id}", body)

    async def submit_score(self, id: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post(f"/v1/training/annotations/{id}/score", body)

    async def list_human_scores(
        self,
        *,
        target_type: str | None = None,
        agent_id: str | None = None,
        scorer_id: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if target_type:
            params["target_type"] = target_type
        if agent_id:
            params["agent_id"] = agent_id
        if scorer_id:
            params["scorer_id"] = scorer_id
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return await self._http.get("/v1/training/human-scores", params=params)

    async def stats(self) -> dict[str, Any]:
        return await self._http.get("/v1/training/human-scores/stats")
