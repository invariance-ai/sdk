from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import ApiKeyRecord, CreateApiKeyBody


class ApiKeysResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def create(self, body: CreateApiKeyBody | None = None) -> ApiKeyRecord:
        return await self._http.post("/v1/api-keys", body or {})

    async def list(self) -> list[ApiKeyRecord]:
        return await self._http.get("/v1/api-keys")

    async def revoke(self, id: str) -> dict[str, bool]:
        return await self._http.delete(f"/v1/api-keys/{id}")
