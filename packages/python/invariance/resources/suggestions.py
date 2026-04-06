from __future__ import annotations

from ..http_client import HttpClient
from ..types import (
    OptimizationSuggestion, CreateSuggestionBody, UpdateSuggestionBody,
    SuggestionListOpts,
)


class SuggestionsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(
        self, opts: SuggestionListOpts | None = None
    ) -> list[OptimizationSuggestion]:
        return await self._http.get("/v1/evals/suggestions", params=opts)

    async def create(
        self, body: CreateSuggestionBody
    ) -> OptimizationSuggestion:
        return await self._http.post("/v1/evals/suggestions", body)

    async def update(
        self, id: str, body: UpdateSuggestionBody
    ) -> OptimizationSuggestion:
        return await self._http.patch(f"/v1/evals/suggestions/{id}", body)

    async def delete(self, id: str) -> dict[str, bool]:
        return await self._http.delete(f"/v1/evals/suggestions/{id}")
