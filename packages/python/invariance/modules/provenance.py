from __future__ import annotations

from typing import Any, Callable, TYPE_CHECKING

if TYPE_CHECKING:
    from .resources import ResourcesModule
    from ..resources.sessions import SessionsResource
    from ..resources.receipts import ReceiptsResource
    from ..resources.contracts import ContractsResource
    from ..resources.a2a import A2AResource
    from ..session import Session


class ProvenanceModule:
    def __init__(
        self,
        resources: ResourcesModule,
        session_factory: Callable[..., Session],
    ) -> None:
        self._resources = resources
        self._session_factory = session_factory

    @property
    def sessions(self) -> SessionsResource:
        return self._resources.sessions

    @property
    def receipts(self) -> ReceiptsResource:
        return self._resources.receipts

    @property
    def contracts(self) -> ContractsResource:
        return self._resources.contracts

    @property
    def a2a(self) -> A2AResource:
        return self._resources.a2a

    def session(self, **opts: Any) -> Session:
        return self._session_factory(**opts)

    async def verify(self, session_id: str) -> Any:
        return await self._resources.sessions.verify(session_id)
