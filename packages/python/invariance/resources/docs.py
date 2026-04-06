from __future__ import annotations

from typing import Any

from ..http_client import HttpClient


class DocsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def get(self) -> Any:
        return await self._http.get("/v1/docs")
