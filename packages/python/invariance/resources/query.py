from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import (
    NLQueryResult, TraceQueryOpts, StructuredTraceQuery, TraceQueryResult,
    StatsResult, StatsQuery, AgentNote, WriteNoteOpts, ToolSchema, QueryScope,
)


class QueryResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def ask(
        self, question: str, scope: QueryScope | None = None
    ) -> NLQueryResult:
        return await self._http.post("/v1/query", {"question": question, "scope": scope})

    async def traces(self, opts: TraceQueryOpts) -> TraceQueryResult:
        return await self._http.post("/v1/query/traces", opts)

    async def traces_structured(self, query: StructuredTraceQuery) -> TraceQueryResult:
        return await self._http.post("/v1/query/traces/structured", query)

    async def stats(self, opts: StatsQuery | None = None) -> StatsResult:
        return await self._http.get("/v1/query/stats", params=opts)

    async def write_note(self, opts: WriteNoteOpts) -> AgentNote:
        return await self._http.post("/v1/query/notes", opts)

    async def read_note(self, key: str) -> dict[str, Any]:
        return await self._http.get(f"/v1/query/notes/{key}")

    async def tools(self) -> dict[str, Any]:
        return await self._http.get("/v1/query/tools")
