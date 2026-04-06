from __future__ import annotations

from ..http_client import HttpClient
from ..resources.identity import IdentityResource
from ..resources.agents import AgentsResource
from ..resources.sessions import SessionsResource
from ..resources.receipts import ReceiptsResource
from ..resources.contracts import ContractsResource
from ..resources.a2a import A2AResource
from ..resources.trace import TraceResource
from ..resources.query import QueryResource
from ..resources.monitors import MonitorsResource
from ..resources.signals import SignalsResource
from ..resources.drift import DriftResource
from ..resources.training import TrainingResource
from ..resources.templates import TemplatesResource
from ..resources.api_keys import ApiKeysResource
from ..resources.usage import UsageResource
from ..resources.search import SearchResource
from ..resources.status import StatusResource
from ..resources.nl_query import NLQueryResource
from ..resources.identities import IdentitiesResource
from ..resources.evals import EvalsResource
from ..resources.failure_clusters import FailureClustersResource
from ..resources.suggestions import SuggestionsResource
from ..resources.docs import DocsResource
from ..resources.datasets import DatasetsResource
from ..resources.scorers import ScorersResource
from ..resources.experiments import ExperimentsResource
from ..resources.prompts import PromptsResource
from ..resources.annotations import AnnotationsResource


class ResourcesModule:
    def __init__(self, http: HttpClient) -> None:
        self.identity = IdentityResource(http)
        self.agents = AgentsResource(http)
        self.sessions = SessionsResource(http)
        self.receipts = ReceiptsResource(http)
        self.contracts = ContractsResource(http)
        self.a2a = A2AResource(http)
        self.trace = TraceResource(http)
        self.query = QueryResource(http)
        self.monitors = MonitorsResource(http)
        self.signals = SignalsResource(http)
        self.drift = DriftResource(http)
        self.training = TrainingResource(http)
        self.templates = TemplatesResource(http)
        self.api_keys = ApiKeysResource(http)
        self.usage = UsageResource(http)
        self.search = SearchResource(http)
        self.status = StatusResource(http)
        self.nl_query = NLQueryResource(http)
        self.identities = IdentitiesResource(http)
        self.evals = EvalsResource(http)
        self.failure_clusters = FailureClustersResource(http)
        self.suggestions = SuggestionsResource(http)
        self.docs = DocsResource(http)
        self.datasets = DatasetsResource(http)
        self.scorers = ScorersResource(http)
        self.experiments = ExperimentsResource(http)
        self.prompts = PromptsResource(http)
        self.annotations = AnnotationsResource(http)
