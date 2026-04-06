from __future__ import annotations

from typing import Any

from ..http_client import HttpClient


class ScorersResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self) -> list[dict[str, Any]]:
        return await self._http.get("/v1/scorers")

    async def get(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/scorers/{id}")

    async def create(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post("/v1/scorers", body)

    async def update(self, id: str, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.patch(f"/v1/scorers/{id}", body)

    async def delete(self, id: str) -> dict[str, Any]:
        return await self._http.delete(f"/v1/scorers/{id}")
