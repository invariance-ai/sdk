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

from .modules.resources import ResourcesModule
from .modules.admin import AdminModule
from .modules.provenance import ProvenanceModule
from .modules.tracing import TracingModule
from .modules.monitors_module import MonitorsModule
from .modules.analysis import AnalysisModule
from .modules.improvement import ImprovementModule
from .modules.run import RunModule

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
        agent: str | None = None,
        instrumentation: dict[str, Any] | None = None,
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

        # Resources (raw namespace)
        self.resources = ResourcesModule(self._http)

        # Workflow modules
        self.run: RunModule = RunModule(
            self.resources,
            agent=agent,
            private_key=private_key,
            instrumentation=instrumentation,
            session_factory=self.session,
        )
        self.provenance = ProvenanceModule(self.resources, self.session)
        self.tracing = TracingModule(self.resources, agent=agent)
        self.monitors = MonitorsModule(self.resources)
        self.analysis = AnalysisModule(self.resources)
        self.improvement = ImprovementModule(self.resources)
        self.admin = AdminModule(self.resources)

    @classmethod
    def init(
        cls,
        *,
        api_key: str,
        api_url: str | None = None,
        private_key: str | None = None,
        agent: str | None = None,
        instrumentation: dict[str, Any] | None = None,
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
            agent=agent,
            instrumentation=instrumentation,
            flush_interval_ms=flush_interval_ms,
            max_batch_size=max_batch_size,
            max_queue_size=max_queue_size,
            on_error=on_error,
        )

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

    def session(
        self,
        *,
        agent: str,
        name: str,
        id: str | None = None,
    ) -> Session:
        """Create a new session. Lazily initialized -- backend POST happens in background."""
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
        await self.resources.sessions.create(opts)

    async def _close_session_backend(
        self, id: str, status: str, close_hash: str
    ) -> None:
        await self._batcher.flush()
        await self.resources.sessions.close(id, status, close_hash)

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
