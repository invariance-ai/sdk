from __future__ import annotations

from typing import Any

from ..http_client import HttpClient


class DatasetsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, *, agent_id: str | None = None) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if agent_id:
            params["agent_id"] = agent_id
        return await self._http.get("/v1/datasets", params=params)

    async def get(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/datasets/{id}")

    async def create(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post("/v1/datasets", body)

    async def update(self, id: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.patch(f"/v1/datasets/{id}", body)

    async def delete(self, id: str) -> dict[str, Any]:
        return await self._http.delete(f"/v1/datasets/{id}")

    async def list_rows(
        self,
        id: str,
        *,
        limit: int | None = None,
        offset: int | None = None,
        tags: list[str] | None = None,
    ) -> list[dict[str, Any]]:
        params: dict[str, Any] = {}
        if limit is not None:
            params["limit"] = limit
        if offset is not None:
            params["offset"] = offset
        if tags:
            params["tags"] = ",".join(tags)
        return await self._http.get(f"/v1/datasets/{id}/rows", params=params)

    async def add_rows(
        self, id: str, body: dict[str, Any] | list[dict[str, Any]]
    ) -> list[dict[str, Any]]:
        return await self._http.post(f"/v1/datasets/{id}/rows", body)

    async def update_row(
        self, id: str, row_id: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._http.patch(f"/v1/datasets/{id}/rows/{row_id}", body)

    async def delete_row(self, id: str, row_id: str) -> dict[str, Any]:
        return await self._http.delete(f"/v1/datasets/{id}/rows/{row_id}")

    async def publish(
        self, id: str, body: dict[str, Any] | None = None
    ) -> dict[str, Any]:
        return await self._http.post(f"/v1/datasets/{id}/publish", body or {})

    async def list_versions(self, id: str) -> list[dict[str, Any]]:
        return await self._http.get(f"/v1/datasets/{id}/versions")

    async def get_version(self, id: str, version: int) -> dict[str, Any]:
        return await self._http.get(f"/v1/datasets/{id}/versions/{version}")

    async def create_from_traces(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post("/v1/datasets/from-traces", body)

    async def import_traces(
        self, id: str, body: dict[str, Any]
    ) -> list[dict[str, Any]]:
        return await self._http.post(f"/v1/datasets/{id}/import-traces", body)

    async def promote_from_compare(
        self, id: str, body: dict[str, Any]
    ) -> list[dict[str, Any]]:
        return await self._http.post(f"/v1/datasets/{id}/from-compare", body)
