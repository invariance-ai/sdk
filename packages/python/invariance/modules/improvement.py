from __future__ import annotations

from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.evals import EvalsResource
    from ..resources.datasets import DatasetsResource
    from ..resources.scorers import ScorersResource
    from ..resources.prompts import PromptsResource
    from ..resources.experiments import ExperimentsResource
    from ..resources.training import TrainingResource
    from ..resources.failure_clusters import FailureClustersResource
    from ..resources.suggestions import SuggestionsResource
    from ..resources.annotations import AnnotationsResource


class ImprovementModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    @property
    def evals(self) -> EvalsResource:
        return self._resources.evals

    @property
    def datasets(self) -> DatasetsResource:
        return self._resources.datasets

    @property
    def scorers(self) -> ScorersResource:
        return self._resources.scorers

    @property
    def prompts(self) -> PromptsResource:
        return self._resources.prompts

    @property
    def experiments(self) -> ExperimentsResource:
        return self._resources.experiments

    @property
    def training(self) -> TrainingResource:
        return self._resources.training

    @property
    def failure_clusters(self) -> FailureClustersResource:
        return self._resources.failure_clusters

    @property
    def suggestions(self) -> SuggestionsResource:
        return self._resources.suggestions

    @property
    def annotations(self) -> AnnotationsResource:
        return self._resources.annotations
