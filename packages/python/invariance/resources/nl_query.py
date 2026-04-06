from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import NLQueryResult


class NLQueryResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def ask(
        self,
        question: str,
        *,
        conversation_id: str | None = None,
        context: dict[str, str] | None = None,
    ) -> NLQueryResult:
        body: dict[str, Any] = {"question": question}
        if conversation_id is not None:
            body["conversation_id"] = conversation_id
        if context is not None:
            body["context"] = context
        return await self._http.post("/v1/nl-query", body)
