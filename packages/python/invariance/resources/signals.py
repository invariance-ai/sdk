from __future__ import annotations

from typing import Any

from ..http_client import HttpClient


class SignalsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, opts: dict[str, Any] | None = None) -> dict[str, Any]:
        return await self._http.get("/v1/signals", params=opts)

    async def get(self, signal_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/signals/{signal_id}")

    async def evidence(self, signal_id: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/signals/{signal_id}/evidence")

    async def create(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post("/v1/signals", body)

    async def acknowledge(self, signal_id: str) -> dict[str, Any]:
        return await self._http.patch(f"/v1/signals/{signal_id}/acknowledge", {})

    async def acknowledge_bulk(self, body: dict[str, Any]) -> dict[str, Any]:
        return await self._http.post("/v1/signals/acknowledge-bulk", body)

    async def stats(self) -> dict[str, Any]:
        return await self._http.get("/v1/signals/stats")
