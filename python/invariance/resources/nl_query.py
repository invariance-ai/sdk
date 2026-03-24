from __future__ import annotations

from ..http_client import HttpClient
from ..types import NLQueryResult


class NLQueryResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def ask(self, question: str) -> NLQueryResult:
        return await self._http.post("/v1/nl-query", {"question": question})
