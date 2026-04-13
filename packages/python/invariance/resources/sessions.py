from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import RemoteSession, SessionListOpts, VerifyResult


class SessionsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def create(self, opts: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post("/v1/sessions", opts)

    async def list(self, opts: SessionListOpts | None = None) -> list[RemoteSession]:
        return await self._http.get("/v1/sessions", params=opts)

    async def get(self, id: str) -> RemoteSession:
        return await self._http.get(f"/v1/sessions/{id}")

    async def close(
        self, id: str, status: str, close_hash: str
    ) -> dict[str, Any]:
        return await self._http.patch(
            f"/v1/sessions/{id}", {"status": status, "close_hash": close_hash}
        )

    async def verify(self, id: str) -> VerifyResult:
        return await self._http.get(f"/v1/sessions/{id}/verify")

    async def proof_summary(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/sessions/{id}/proof-summary")

    async def summary(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{id}/summary")

    async def proof(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{id}/proof")

    async def replay(self, id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/trace/sessions/{id}/replay")

    async def signals(self, id: str, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        return await self._http.get(f"/v1/query/session/{id}/signals", params=opts)
