from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.monitors import MonitorsResource
    from ..resources.signals import SignalsResource
    from ..resources.templates import TemplatesResource
class MonitorsModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

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
