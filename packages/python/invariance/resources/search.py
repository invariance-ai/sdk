from __future__ import annotations

from ..http_client import HttpClient
from ..types import SearchResult


class SearchResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def query(self, q: str) -> list[SearchResult]:
        return await self._http.get("/v1/search", params={"q": q})
