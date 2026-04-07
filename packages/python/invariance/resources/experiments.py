from __future__ import annotations

from typing import Any

from ..http_client import HttpClient


class ExperimentsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(
        self,
        *,
        suite_id: str | None = None,
        dataset_id: str | None = None,
        status: str | None = None,
        limit: int | None = None,
        offset: int | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if suite_id:
            params["suite_id"] = suite_id
        if dataset_id:
            params["dataset_id"] = dataset_id
        if status:
            params["status"] = status
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        return await self._http.get("/v1/experiments", params=params)

    async def get(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/experiments/{id}")

    async def create(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post("/v1/experiments", body)

    async def run(self, id: str) -> dict[str, Any]:
        return await self._http.post(f"/v1/experiments/{id}/run", {})

    async def delete(self, id: str) -> dict[str, Any]:
        return await self._http.delete(f"/v1/experiments/{id}")

    async def compare(self, exp_a: str, exp_b: str) -> dict[str, Any]:
        return await self._http.get(
            "/v1/experiments/compare", params={"exp_a": exp_a, "exp_b": exp_b}
        )
