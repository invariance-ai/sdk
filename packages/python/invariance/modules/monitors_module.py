from __future__ import annotations

from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.monitors import MonitorsResource
    from ..resources.signals import SignalsResource
    from ..resources.templates import TemplatesResource
    from ..resources.status import StatusResource


class MonitorsModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    async def list(self, opts: dict[str, Any] | None = None) -> Any:
        return await self._resources.monitors.list(opts)

    async def get(self, id: str) -> Any:
        return await self._resources.monitors.get(id)

    async def create(self, body: dict[str, Any]) -> Any:
        return await self._resources.monitors.create(body)

    async def update(self, id: str, body: dict[str, Any]) -> Any:
        return await self._resources.monitors.update(id, body)

    async def delete(self, id: str) -> Any:
        return await self._resources.monitors.delete(id)

    async def evaluate(self, id: str) -> Any:
        return await self._resources.monitors.evaluate(id)

    async def evaluate_all(self) -> Any:
        return await self._resources.monitors.evaluate_all()

    async def validate(self, definition: dict[str, Any]) -> Any:
        return await self._resources.monitors.validate(definition)

    async def compile_preview(self, rule: str) -> Any:
        return await self._resources.monitors.compile_preview(rule)

    async def list_events(self, opts: dict[str, Any] | None = None) -> Any:
        return await self._resources.monitors.list_events(opts)

    async def acknowledge_event(self, event_id: str) -> Any:
        return await self._resources.monitors.acknowledge_event(event_id)

    @property
    def monitors(self) -> MonitorsResource:
        return self._resources.monitors

    @property
    def signals(self) -> SignalsResource:
        return self._resources.signals

    @property
    def templates(self) -> TemplatesResource:
        return self._resources.templates

    @property
    def status(self) -> StatusResource:
        return self._resources.status

    async def emit_signal(self, body: dict[str, Any]) -> Any:
        return await self._resources.signals.create(body)
