from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import (
    TrainingPair, CreateTrainingPairBody, UpdateTrainingPairBody,
    TraceFlag, CreateTraceFlagBody, UpdateTraceFlagBody, TraceFlagStats, TraceFlagQuery,
)


class TrainingResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self, opts: dict[str, str] | None = None) -> list[TrainingPair]:
        return await self._http.get("/v1/training/pairs", params=opts)

    async def get(self, id: str) -> TrainingPair:
        return await self._http.get(f"/v1/training/pairs/{id}")

    async def create(self, body: CreateTrainingPairBody) -> TrainingPair:
        return await self._http.post("/v1/training/pairs", body)

    async def update(self, id: str, body: UpdateTrainingPairBody) -> TrainingPair:
        return await self._http.patch(f"/v1/training/pairs/{id}", body)

    async def delete(self, id: str) -> dict[str, bool]:
        return await self._http.delete(f"/v1/training/pairs/{id}")

    # Trace Flags
    async def create_flag(self, body: CreateTraceFlagBody) -> TraceFlag:
        return await self._http.post("/v1/training/flags", body)

    async def list_flags(self, opts: TraceFlagQuery | None = None) -> list[TraceFlag]:
        return await self._http.get("/v1/training/flags", params=opts)

    async def update_flag(self, id: str, body: UpdateTraceFlagBody) -> TraceFlag:
        return await self._http.patch(f"/v1/training/flags/{id}", body)

    async def delete_flag(self, id: str) -> None:
        await self._http.delete(f"/v1/training/flags/{id}")

    async def flag_stats(self) -> TraceFlagStats:
        return await self._http.get("/v1/training/flags/stats")
