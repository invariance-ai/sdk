from __future__ import annotations

import asyncio
import os
import re
from typing import Any, Awaitable, Callable, TypeVar

from .batcher import Batcher
from .crypto import generate_keypair, get_public_key, derive_agent_keypair
from .errors import InvarianceError
from .http_client import HttpClient
from .session import Session
from .types import Action, Receipt, SessionCreateOpts

from .resources.identity import IdentityResource
from .resources.agents import AgentsResource
from .resources.sessions import SessionsResource
from .resources.receipts import ReceiptsResource
from .resources.contracts import ContractsResource
from .resources.a2a import A2AResource
from .resources.trace import TraceResource
from .resources.query import QueryResource
from .resources.monitors import MonitorsResource
from .resources.drift import DriftResource
from .resources.training import TrainingResource
from .resources.templates import TemplatesResource
from .resources.api_keys import ApiKeysResource
from .resources.usage import UsageResource
from .resources.search import SearchResource
from .resources.status import StatusResource
from .resources.nl_query import NLQueryResource
from .resources.identities import IdentitiesResource
from .resources.evals import EvalsResource
from .resources.failure_clusters import FailureClustersResource
from .resources.suggestions import SuggestionsResource

T = TypeVar("T")

DEFAULT_API_URL = "https://api.invariance.dev"
DEFAULT_FLUSH_INTERVAL_MS = 5000
DEFAULT_MAX_BATCH_SIZE = 50


class Invariance:
    version: str = "1.0.0"

    def __init__(
        self,
        *,
        api_key: str,
        api_url: str | None = None,
        private_key: str | None = None,
        flush_interval_ms: int | None = None,
        max_batch_size: int | None = None,
        max_queue_size: int | None = None,
        on_error: Callable[[InvarianceError], None] | None = None,
    ) -> None:
        if not api_key:
            raise InvarianceError("INIT_FAILED", "api_key is required")

        self._private_key = private_key

        if self._private_key and not re.fullmatch(r"[0-9a-fA-F]{64}", self._private_key):
            raise InvarianceError(
                "INVALID_KEY",
                "private_key must be a 32-byte hex string (64 characters)",
            )

        resolved_url = api_url or os.environ.get("INVARIANCE_API_URL") or DEFAULT_API_URL

        self._http = HttpClient(
            base_url=resolved_url,
            api_key=api_key,
            on_error=on_error,
        )

        self._batcher = Batcher(
            http=self._http,
            flush_interval_ms=flush_interval_ms or DEFAULT_FLUSH_INTERVAL_MS,
            max_batch_size=max_batch_size or DEFAULT_MAX_BATCH_SIZE,
            max_queue_size=max_queue_size or 1000,
            on_error=on_error,
        )

        self._pending_session_closes: list[asyncio.Task[None]] = []

        # Resource namespaces
        self.identity = IdentityResource(self._http)
        self.agents = AgentsResource(self._http)
        self.sessions = SessionsResource(self._http)
        self.receipts = ReceiptsResource(self._http)
        self.contracts = ContractsResource(self._http)
        self.a2a = A2AResource(self._http)
        self.trace = TraceResource(self._http)
        self.query = QueryResource(self._http)
        self.monitors = MonitorsResource(self._http)
        self.drift = DriftResource(self._http)
        self.training = TrainingResource(self._http)
        self.templates = TemplatesResource(self._http)
        self.api_keys = ApiKeysResource(self._http)
        self.usage = UsageResource(self._http)
        self.search = SearchResource(self._http)
        self.status = StatusResource(self._http)
        self.nl_query = NLQueryResource(self._http)
        self.identities = IdentitiesResource(self._http)
        self.evals = EvalsResource(self._http)
        self.failure_clusters = FailureClustersResource(self._http)
        self.suggestions = SuggestionsResource(self._http)

    @classmethod
    def init(
        cls,
        *,
        api_key: str,
        api_url: str | None = None,
        private_key: str | None = None,
        flush_interval_ms: int | None = None,
        max_batch_size: int | None = None,
        max_queue_size: int | None = None,
        on_error: Callable[[InvarianceError], None] | None = None,
    ) -> Invariance:
        """Create a new Invariance client."""
        return cls(
            api_key=api_key,
            api_url=api_url,
            private_key=private_key,
            flush_interval_ms=flush_interval_ms,
            max_batch_size=max_batch_size,
            max_queue_size=max_queue_size,
            on_error=on_error,
        )

    @staticmethod
    def _normalize_trace_verify_result(payload: Any) -> dict[str, Any]:
        if isinstance(payload, dict):
            if isinstance(payload.get("verified"), bool):
                return {
                    "verified": payload["verified"],
                    "errors": [
                        item for item in payload.get("errors", [])
                        if isinstance(item, str)
                    ],
                }
            if isinstance(payload.get("valid"), bool):
                return {
                    "verified": payload["valid"],
                    "errors": [payload["error"]]
                    if isinstance(payload.get("error"), str)
                    else [],
                }
        return {"verified": False, "errors": ["Invalid verification response"]}

    @staticmethod
    def generate_keypair() -> dict[str, str]:
        """Generate a new Ed25519 keypair."""
        return generate_keypair()

    @staticmethod
    def get_public_key(private_key: str) -> str:
        """Derive the public key from a private key."""
        return get_public_key(private_key)

    @staticmethod
    def derive_keypair(owner_private_key: str, identity: str) -> dict[str, str]:
        """Derive a child keypair for an identity (e.g. 'org/agent-name')."""
        return derive_agent_keypair(owner_private_key, identity)

    async def create_agent(self, name: str) -> Any:
        return await self.agents.create({"name": name})

    async def list_agents(self) -> Any:
        return await self.agents.list()

    async def get_agent(self, id: str) -> Any:
        return await self.agents.get(id)

    async def get_agent_metrics(self) -> Any:
        payload = await self.agents.metrics()
        return payload.get("metrics", payload) if isinstance(payload, dict) else payload

    async def get_agent_templates(self, agent_id: str) -> Any:
        return await self.agents.get_templates(agent_id)

    async def upsert_agent_templates(self, agent_id: str, templates: Any) -> Any:
        return await self.agents.upsert_templates(agent_id, templates)

    async def get_agent_policies(self, agent_id: str) -> Any:
        return await self.agents.get_policies(agent_id)

    async def upsert_agent_policies(self, agent_id: str, policies: Any) -> Any:
        return await self.agents.upsert_policies(agent_id, policies)

    async def signup(self, opts: Any) -> Any:
        return await self.identity.signup(opts)

    async def create_org(self, name: str) -> Any:
        return await self.identity.create_org({"name": name})

    async def register_agent_identity(self, owner: str, opts: Any) -> Any:
        return await self.identity.register_agent(owner, opts)

    async def lookup_agent_identity(self, owner: str, name: str) -> Any:
        return await self.identity.lookup(owner, name)

    async def list_sessions(self, opts: dict[str, Any] | None = None) -> Any:
        return await self.sessions.list(opts)

    async def get_session(self, id: str) -> Any:
        return await self.sessions.get(id)

    async def get_receipts(
        self, session_id: str, opts: dict[str, Any] | None = None
    ) -> Any:
        return await self.receipts.query(
            {"sessionId": session_id, "limit": 1000, **(opts or {})}
        )

    async def verify_session(self, id: str) -> Any:
        return await self.sessions.verify(id)

    async def get_anomaly_feed(self, opts: dict[str, Any] | None = None) -> Any:
        payload = await self.trace.get_anomalies(opts)
        return payload.get("anomalies", payload) if isinstance(payload, dict) else payload

    async def get_trace_nodes(self, session_id: str) -> Any:
        payload = await self.trace.get_session_nodes(session_id)
        return payload.get("nodes", payload) if isinstance(payload, dict) else payload

    async def get_replay(self, session_id: str) -> Any:
        return await self.trace.get_replay(session_id)

    async def get_node_snapshot(self, node_id: str) -> Any:
        return await self.trace.get_node_snapshot(node_id)

    async def get_causal_chain(self, node_id: str) -> Any:
        return await self.trace.get_causal_chain(node_id)

    async def get_diff_paths(self, node_id_a: str, node_id_b: str) -> Any:
        return await self.trace.diff_nodes(node_id_a, node_id_b)

    async def get_dependency_context(self, node_id: str) -> Any:
        return await self.trace.get_dependency_context(node_id)

    async def get_narrative(self, session_id: str) -> Any:
        return await self.trace.get_narrative(session_id)

    async def get_patterns(self, opts: dict[str, Any] | None = None) -> Any:
        payload = await self.trace.get_patterns(opts)
        return payload.get("patterns", payload) if isinstance(payload, dict) else payload

    async def get_graph_snapshot(self, opts: dict[str, str] | None = None) -> Any:
        return await self.trace.get_graph_snapshot(opts)

    async def generate_replay(self, session_id: str, opts: Any) -> Any:
        return await self.trace.generate_replay(session_id, opts)

    async def generate_audit(self, session_id: str, node_id: str | None = None) -> Any:
        return await self.trace.generate_audit(session_id, node_id)

    async def verify_trace_chain(self, session_id: str) -> dict[str, Any]:
        payload = await self.trace.verify_chain(session_id)
        return self._normalize_trace_verify_result(payload)

    async def search_global(self, query: str) -> Any:
        return await self.search.query(query)

    async def list_api_keys(self) -> Any:
        return await self.api_keys.list()

    async def create_api_key(self, body: Any = None) -> Any:
        return await self.api_keys.create(body)

    async def revoke_api_key(self, id: str) -> Any:
        return await self.api_keys.revoke(id)

    async def get_usage_events(self, opts: Any = None) -> Any:
        return await self.usage.query(opts)

    async def get_a2a_conversations(self, opts: Any = None) -> Any:
        return await self.a2a.conversations(opts)

    async def get_a2a_conversation(self, conversation_id: str) -> Any:
        return await self.a2a.conversation(conversation_id)

    async def get_a2a_messages(self, conversation_id: str) -> Any:
        return await self.a2a.messages(conversation_id)

    async def get_a2a_peers(self, agent_id: str) -> Any:
        return await self.a2a.peers(agent_id)

    async def get_agent_identities(self) -> Any:
        return await self.identities.list()

    async def get_agent_identity(self, id: str) -> Any:
        return await self.identities.get(id)

    async def get_contracts(self) -> Any:
        return await self.contracts.list()

    async def get_contract(self, id: str) -> Any:
        return await self.contracts.get(id)

    async def get_drift_catches(self) -> Any:
        return await self.drift.catches()

    async def get_drift_comparison(self, opts: Any = None) -> Any:
        return await self.drift.comparison(opts)

    async def get_monitors(self, opts: Any = None) -> Any:
        return await self.monitors.list(opts)

    async def create_monitor(self, body: Any) -> Any:
        return await self.monitors.create(body)

    async def update_monitor(self, id: str, body: Any) -> Any:
        return await self.monitors.update(id, body)

    async def delete_monitor(self, id: str) -> Any:
        return await self.monitors.delete(id)

    async def evaluate_monitor(self, id: str) -> Any:
        return await self.monitors.evaluate(id)

    async def get_monitor_events(self, opts: Any = None) -> Any:
        payload = await self.monitors.list_events(opts)
        return payload.get("events", payload) if isinstance(payload, dict) else payload

    async def acknowledge_monitor_event(self, event_id: str) -> Any:
        return await self.monitors.acknowledge_event(event_id)

    async def get_training_pairs(self, opts: dict[str, str] | None = None) -> Any:
        return await self.training.list(opts)

    async def create_training_pair(self, body: Any) -> Any:
        return await self.training.create(body)

    async def update_training_pair(self, id: str, body: Any) -> Any:
        return await self.training.update(id, body)

    async def delete_training_pair(self, id: str) -> Any:
        return await self.training.delete(id)

    async def create_trace_flag(self, body: Any) -> Any:
        return await self.training.create_flag(body)

    async def get_trace_flags(self, opts: Any = None) -> Any:
        return await self.training.list_flags(opts)

    async def update_trace_flag(self, id: str, body: Any) -> Any:
        return await self.training.update_flag(id, body)

    async def delete_trace_flag(self, id: str) -> Any:
        return await self.training.delete_flag(id)

    async def get_trace_flag_stats(self) -> Any:
        return await self.training.flag_stats()

    async def ask_question(self, question: str, scope: Any = None) -> Any:
        return await self.query.ask(question, scope)

    async def ask_query(self, question: str, opts: Any = None) -> Any:
        return await self.nl_query.ask(question, opts)

    async def get_live_status(self) -> Any:
        return await self.status.snapshot()

    async def connect_live_status(self, on_event: Any) -> Any:
        return await self.status.connect(on_event)

    async def get_eval_suites(self, opts: dict[str, str] | None = None) -> Any:
        return await self.evals.list_suites(opts)

    async def create_eval_suite(self, body: Any) -> Any:
        return await self.evals.create_suite(body)

    async def get_eval_suite(self, id: str) -> Any:
        return await self.evals.get_suite(id)

    async def update_eval_suite(self, id: str, body: Any) -> Any:
        return await self.evals.update_suite(id, body)

    async def delete_eval_suite(self, id: str) -> None:
        await self.evals.delete_suite(id)

    async def get_eval_cases(self, suite_id: str) -> Any:
        return await self.evals.list_cases(suite_id)

    async def create_eval_case(self, suite_id: str, body: Any) -> Any:
        return await self.evals.create_case(suite_id, body)

    async def update_eval_case(self, id: str, body: Any) -> Any:
        return await self.evals.update_case(id, body)

    async def delete_eval_case(self, id: str) -> None:
        await self.evals.delete_case(id)

    async def trigger_eval_run(self, suite_id: str, body: Any) -> Any:
        return await self.evals.trigger_run(suite_id, body)

    async def get_eval_runs(self, opts: dict[str, str] | None = None) -> Any:
        return await self.evals.list_runs(opts)

    async def get_eval_run(self, id: str) -> Any:
        return await self.evals.get_run(id)

    async def compare_eval_runs(self, suite_id: str, run_a: str, run_b: str) -> Any:
        return await self.evals.compare(suite_id, run_a, run_b)

    async def get_failure_clusters(self, opts: Any = None) -> Any:
        return await self.failure_clusters.list(opts)

    async def get_failure_cluster(self, id: str) -> Any:
        return await self.failure_clusters.get(id)

    async def create_failure_cluster(self, body: Any) -> Any:
        return await self.failure_clusters.create(body)

    async def update_failure_cluster(self, id: str, body: Any) -> Any:
        return await self.failure_clusters.update(id, body)

    async def delete_failure_cluster(self, id: str) -> Any:
        return await self.failure_clusters.delete(id)

    async def add_failure_cluster_member(self, cluster_id: str, body: Any) -> Any:
        return await self.failure_clusters.add_member(cluster_id, body)

    async def get_suggestions(self, opts: Any = None) -> Any:
        return await self.suggestions.list(opts)

    async def create_suggestion(self, body: Any) -> Any:
        return await self.suggestions.create(body)

    async def update_suggestion(self, id: str, body: Any) -> Any:
        return await self.suggestions.update(id, body)

    async def delete_suggestion(self, id: str) -> Any:
        return await self.suggestions.delete(id)

    async def list_templates(self) -> Any:
        return await self.templates.list()

    async def apply_template(self, id: str, opts: Any = None) -> Any:
        return await self.templates.apply(id, opts)

    def session(
        self,
        *,
        agent: str,
        name: str,
        id: str | None = None,
    ) -> Session:
        """Create a new session. Lazily initialized — backend POST happens in background."""
        return Session(
            agent=agent,
            name=name,
            id=id,
            private_key=self._private_key,
            enqueue=self._batcher.enqueue,
            on_create=self._create_session_backend,
            on_close=self._close_session_backend,
        )

    async def _create_session_backend(self, opts: dict[str, Any]) -> None:
        await self.sessions.create(opts)

    async def _close_session_backend(
        self, id: str, status: str, close_hash: str
    ) -> None:
        await self._batcher.flush()
        await self.sessions.close(id, status, close_hash)

    async def create_session(
        self, *, agent: str, name: str, id: str | None = None
    ) -> Session:
        """Create a session and await its backend creation before returning."""
        s = self.session(agent=agent, name=name, id=id)
        await s.ready
        return s

    async def record(
        self,
        *,
        agent: str,
        action: str,
        input: dict[str, Any],
        output: dict[str, Any] | None = None,
        error: str | None = None,
        name: str | None = None,
    ) -> Receipt:
        """Convenience: record a single action (creates a temporary session)."""
        s = self.session(agent=agent, name=name or action)
        act: Action = {"action": action, "input": input}
        if output is not None:
            act["output"] = output
        if error is not None:
            act["error"] = error
        receipt = await s.record(act)
        await s.end()
        return receipt

    async def wrap(
        self,
        *,
        agent: str,
        action: str,
        input: dict[str, Any],
        fn: Callable[[], T | Awaitable[T]],
        name: str | None = None,
    ) -> dict[str, Any]:
        """Wrap a function call: execute it, then record a receipt with the result."""
        s = self.session(agent=agent, name=name or action)
        result = await s.wrap({"action": action, "input": input}, fn)
        await s.end()
        return result

    async def flush(self) -> None:
        """Flush all pending receipts to the backend."""
        await self._batcher.flush()

    async def shutdown(self) -> None:
        """Gracefully shut down: flush receipts, await pending session closes."""
        await self._batcher.shutdown()
        if self._pending_session_closes:
            await asyncio.gather(
                *self._pending_session_closes, return_exceptions=True
            )
        await self._http.close()
