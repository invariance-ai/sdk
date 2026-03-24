from __future__ import annotations

from ..http_client import HttpClient
from ..types import IdentityRecord


class IdentitiesResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self) -> list[IdentityRecord]:
        return await self._http.get("/v1/identities")

    async def get(self, id: str) -> IdentityRecord:
        return await self._http.get(f"/v1/identities/{id}")
