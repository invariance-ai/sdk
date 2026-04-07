from __future__ import annotations

from typing import TYPE_CHECKING, Any

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


class _RecommendationsAccessor:
    """Combines failure clusters and optimization suggestions."""

    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources

    @property
    def clusters(self) -> FailureClustersResource:
        return self._resources.failure_clusters

    @property
    def suggestions(self) -> SuggestionsResource:
        return self._resources.suggestions


class ImprovementModule:
    def __init__(self, resources: ResourcesModule) -> None:
        self._resources = resources
        self._recommendations = _RecommendationsAccessor(resources)

    # ── Product-facing capability names ──

    @property
    def evaluations(self) -> EvalsResource:
        """Evaluation suites, runs, comparisons, and regressions."""
        return self._resources.evals

    @property
    def data(self) -> DatasetsResource:
        """Datasets, rows, versions, and data imports."""
        return self._resources.datasets

    @property
    def scoring(self) -> ScorersResource:
        """Scoring functions and score configuration."""
        return self._resources.scorers

    @property
    def prompts(self) -> PromptsResource:
        """Prompt templates, versions, and diffs."""
        return self._resources.prompts

    @property
    def experiments(self) -> ExperimentsResource:
        """Experiment runs, comparisons, and orchestration."""
        return self._resources.experiments

    @property
    def training(self) -> TrainingResource:
        """Training pairs and candidate generation."""
        return self._resources.training

    @property
    def recommendations(self) -> _RecommendationsAccessor:
        """Failure clusters and optimization suggestions."""
        return self._recommendations

    @property
    def annotations(self) -> AnnotationsResource:
        """Human labels, flags, and feedback."""
        return self._resources.annotations

    # ── Legacy aliases (deprecated) ──

    @property
    def evals(self) -> EvalsResource:
        """Deprecated: use ``evaluations`` instead."""
        return self._resources.evals

    @property
    def datasets(self) -> DatasetsResource:
        """Deprecated: use ``data`` instead."""
        return self._resources.datasets

    @property
    def scorers(self) -> ScorersResource:
        """Deprecated: use ``scoring`` instead."""
        return self._resources.scorers

    @property
    def failure_clusters(self) -> FailureClustersResource:
        """Deprecated: use ``recommendations.clusters`` instead."""
        return self._resources.failure_clusters

    @property
    def suggestions(self) -> SuggestionsResource:
        """Deprecated: use ``recommendations.suggestions`` instead."""
        return self._resources.suggestions
