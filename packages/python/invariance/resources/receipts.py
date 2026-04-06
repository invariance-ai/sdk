from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import Receipt, ReceiptQuery


class ReceiptsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def submit(self, receipts: list[Receipt]) -> dict[str, int]:
        return await self._http.post("/v1/receipts", {"receipts": receipts})

    async def query(self, opts: ReceiptQuery | None = None) -> list[Receipt]:
        return await self._http.get("/v1/receipts", params=opts)
