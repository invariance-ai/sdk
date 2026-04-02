from __future__ import annotations

from contextlib import asynccontextmanager
from typing import TYPE_CHECKING, AsyncGenerator, Any

from . import _state

if TYPE_CHECKING:
    from .client import Invariance
    from .session import Session


@asynccontextmanager
async def trace_session(
    *,
    name: str,
    agent: str | None = None,
    client: Invariance | None = None,
) -> AsyncGenerator[Session, None]:
    resolved_client = _state.get_client(client)
    resolved_agent = _state.get_agent(agent)

    if _state.get_active_session() is not None:
        raise _state.InvarianceError(
            "SESSION_CLOSED",
            "Nested trace_session() is not supported. "
            "Close the outer trace_session before opening a new one.",
        )

    session = resolved_client.session(agent=resolved_agent, name=name)
    token = _state.set_active_session(session)
    try:
        yield session
    finally:
        _state._active_session.reset(token)
        await session.end()
