from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import TemplatePack, TemplateApplyResult


class TemplatesResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(self) -> list[TemplatePack]:
        return await self._http.get("/v1/templates")

    async def apply(
        self, id: str, opts: dict[str, str] | None = None
    ) -> TemplateApplyResult:
        return await self._http.post(f"/v1/templates/{id}/apply", opts or {})
