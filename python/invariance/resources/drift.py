from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import DriftCatch, DriftComparison, DriftComparisonQuery


class DriftResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def catches(self) -> list[DriftCatch]:
        return await self._http.get("/v1/drift/catches")

    async def comparison(
        self, opts: DriftComparisonQuery | None = None
    ) -> DriftComparison:
        return await self._http.get("/v1/drift/comparison", params=opts)
