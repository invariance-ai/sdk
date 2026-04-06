from __future__ import annotations

from contextvars import ContextVar, Token
from typing import TYPE_CHECKING

from .errors import InvarianceError

if TYPE_CHECKING:
    from .client import Invariance
    from .session import Session

_default_client: Invariance | None = None
_default_agent: str | None = None
_active_session: ContextVar[Session | None] = ContextVar(
    "_active_session", default=None
)


def configure(client: Invariance, agent: str) -> None:
    global _default_client, _default_agent
    _default_client = client
    _default_agent = agent


def get_client(explicit: Invariance | None = None) -> Invariance:
    resolved = explicit or _default_client
    if resolved is None:
        raise InvarianceError(
            "NOT_INITIALIZED",
            "No Invariance client configured. Call invariance.init() first or pass client= explicitly.",
        )
    return resolved


def get_agent(explicit: str | None = None) -> str:
    resolved = explicit or _default_agent
    if resolved is None:
        raise InvarianceError(
            "NOT_INITIALIZED",
            "No default agent configured. Call invariance.init(agent=...) first or pass agent= explicitly.",
        )
    return resolved


def get_active_session() -> Session | None:
    return _active_session.get()


def set_active_session(session: Session | None) -> Token[Session | None]:
    return _active_session.set(session)
