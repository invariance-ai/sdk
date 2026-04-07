from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.agents import AgentsResource
    from ..resources.identities import IdentitiesResource
    from ..resources.identity import IdentityResource
    from ..resources.api_keys import ApiKeysResource


class AdminModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    @property
    def agents(self) -> AgentsResource:
        return self._resources.agents

    @property
    def identities(self) -> IdentitiesResource:
        return self._resources.identities

    @property
    def identity(self) -> IdentityResource:
        return self._resources.identity

    @property
    def api_keys(self) -> ApiKeysResource:
        return self._resources.api_keys
