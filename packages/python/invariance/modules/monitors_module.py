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
