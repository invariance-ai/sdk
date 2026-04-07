from __future__ import annotations

from typing import Any

from ..http_client import HttpClient


class PromptsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self) -> list[dict[str, Any]]:
        return await self._http.get("/v1/prompts")

    async def get(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/prompts/{id}")

    async def create(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post("/v1/prompts", body)

    async def update(self, id: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.patch(f"/v1/prompts/{id}", body)

    async def delete(self, id: str) -> dict[str, Any]:
        return await self._http.delete(f"/v1/prompts/{id}")

    async def list_versions(self, id: str) -> list[dict[str, Any]]:
        return await self._http.get(f"/v1/prompts/{id}/versions")

    async def create_version(
        self, id: str, body: dict[str, Any]
    ) -> dict[str, Any]:
        return await self._http.post(f"/v1/prompts/{id}/versions", body)

    async def get_version(self, id: str, version: int) -> dict[str, Any]:
        return await self._http.get(f"/v1/prompts/{id}/versions/{version}")

    async def diff(self, from_id: str, to_id: str) -> dict[str, Any]:
        return await self._http.get(
            "/v1/prompts/diff", params={"from": from_id, "to": to_id}
        )
