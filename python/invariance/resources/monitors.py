from __future__ import annotations

from typing import Any

from ..http_client import HttpClient
from ..types import (
    Monitor, CreateMonitorBody, UpdateMonitorBody,
    MonitorEvaluateResult, MonitorSignal, MonitorEventsQuery, MonitorCompilePreview,
)


class MonitorsResource:
    def __init__(self, http: HttpClient) -> None:
        self._http = http

    async def list(
        self, opts: dict[str, str] | None = None
    ) -> list[Monitor]:
        return await self._http.get("/v1/monitors", params=opts)

    async def get(self, id: str) -> Monitor:
        return await self._http.get(f"/v1/monitors/{id}")

    async def create(self, body: CreateMonitorBody) -> Monitor:
        return await self._http.post("/v1/monitors", body)

    async def update(self, id: str, body: UpdateMonitorBody) -> Monitor:
        return await self._http.patch(f"/v1/monitors/{id}", body)

    async def delete(self, id: str) -> dict[str, bool]:
        return await self._http.delete(f"/v1/monitors/{id}")

    async def evaluate(self, id: str) -> MonitorEvaluateResult:
        return await self._http.post(f"/v1/monitors/{id}/evaluate")

    async def evaluate_all(self) -> Any:
        return await self._http.post("/v1/monitors/evaluate-all")

    async def compile_preview(self, rule: str) -> MonitorCompilePreview:
        return await self._http.post("/v1/monitors/compile-preview", {"rule": rule})

    async def list_events(
        self, opts: MonitorEventsQuery | None = None
    ) -> dict[str, Any]:
        return await self._http.get("/v1/monitors/events", params=opts)

    async def acknowledge_event(self, event_id: str) -> dict[str, Any]:
        return await self._http.patch(
            f"/v1/monitors/events/{event_id}/acknowledge", {}
        )
