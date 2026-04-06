from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.query import QueryResource
    from ..resources.nl_query import NLQueryResource
    from ..resources.drift import DriftResource
    from ..resources.search import SearchResource
    from ..resources.usage import UsageResource


class AnalysisModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    @property
    def query(self) -> QueryResource:
        return self._resources.query

    @property
    def nl_query(self) -> NLQueryResource:
        return self._resources.nl_query

    @property
    def drift(self) -> DriftResource:
        return self._resources.drift

    @property
    def search(self) -> SearchResource:
        return self._resources.search

    @property
    def usage(self) -> UsageResource:
        return self._resources.usage
