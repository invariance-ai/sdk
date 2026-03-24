from __future__ import annotations

from ..http_client import HttpClient
from ..types import UsageEvent, UsageQuery


class UsageResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def query(self, opts: UsageQuery | None = None) -> list[UsageEvent]:
        return await self._http.get("/v1/usage", params=opts)
