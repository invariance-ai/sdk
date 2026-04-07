from __future__ import annotations

import warnings
from typing import Any, TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.monitors import MonitorsResource
    from ..resources.signals import SignalsResource
    from ..resources.templates import TemplatesResource


def _deprecation(method: str) -> None:
    warnings.warn(
        f"monitors.{method}() is deprecated. Use monitors.monitors.{method}() instead.",
        DeprecationWarning,
        stacklevel=3,
    )


class MonitorsModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    async def list(self, opts: dict[str, Any] | None = None) -> Any:
        """.. deprecated:: Use ``monitors.monitors.list()``."""
        _deprecation("list")
        return await self._resources.monitors.list(opts)

    async def get(self, id: str) -> Any:
        """.. deprecated:: Use ``monitors.monitors.get()``."""
        _deprecation("get")
        return await self._resources.monitors.get(id)

    async def create(self, body: dict[str, Any]) -> Any:
        """.. deprecated:: Use ``monitors.monitors.create()``."""
        _deprecation("create")
        return await self._resources.monitors.create(body)

    async def update(self, id: str, body: dict[str, Any]) -> Any:
        """.. deprecated:: Use ``monitors.monitors.update()``."""
        _deprecation("update")
        return await self._resources.monitors.update(id, body)

    async def delete(self, id: str) -> Any:
        """.. deprecated:: Use ``monitors.monitors.delete()``."""
        _deprecation("delete")
        return await self._resources.monitors.delete(id)

    async def evaluate(self, id: str) -> Any:
        """.. deprecated:: Use ``monitors.monitors.evaluate()``."""
        _deprecation("evaluate")
        return await self._resources.monitors.evaluate(id)

    async def evaluate_all(self) -> Any:
        """.. deprecated:: Use ``monitors.monitors.evaluate_all()``."""
        _deprecation("evaluate_all")
        return await self._resources.monitors.evaluate_all()

    async def validate(self, definition: dict[str, Any]) -> Any:
        """.. deprecated:: Use ``monitors.monitors.validate()``."""
        _deprecation("validate")
        return await self._resources.monitors.validate(definition)

    async def compile_preview(self, rule: str) -> Any:
        """.. deprecated:: Use ``monitors.monitors.compile_preview()``."""
        _deprecation("compile_preview")
        return await self._resources.monitors.compile_preview(rule)

    async def list_events(self, opts: dict[str, Any] | None = None) -> Any:
        """.. deprecated:: Use ``monitors.monitors.list_events()``."""
        _deprecation("list_events")
        return await self._resources.monitors.list_events(opts)

    async def acknowledge_event(self, event_id: str) -> Any:
        """.. deprecated:: Use ``monitors.monitors.acknowledge_event()``."""
        _deprecation("acknowledge_event")
        return await self._resources.monitors.acknowledge_event(event_id)

    @property
    def monitors(self) -> MonitorsResource:
        """Access the underlying monitors resource."""
        return self._resources.monitors

    @property
    def signals(self) -> SignalsResource:
        """Access the signals resource."""
        return self._resources.signals

    @property
    def templates(self) -> TemplatesResource:
        """Access the templates resource."""
        return self._resources.templates

    async def emit_signal(self, body: dict[str, Any]) -> Any:
        """.. deprecated:: Use ``run.signal()`` or ``resources.signals.create()``."""
        warnings.warn(
            "monitors.emit_signal() is deprecated. Use run.signal() or resources.signals.create() instead.",
            DeprecationWarning,
            stacklevel=2,
        )
        return await self._resources.signals.create(body)
