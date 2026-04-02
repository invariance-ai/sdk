from __future__ import annotations

import asyncio
import functools
import inspect
from typing import Any, Callable, TypeVar, get_args

from .errors import InvarianceError
from .types import Action, BehavioralPrimitive
from . import _state

F = TypeVar("F", bound=Callable[..., Any])

_VALID_PRIMITIVES: set[str] = set(get_args(BehavioralPrimitive))


def _capture_args(fn: Callable[..., Any], args: tuple[Any, ...], kwargs: dict[str, Any]) -> dict[str, Any]:
    sig = inspect.signature(fn)
    try:
        bound = sig.bind(*args, **kwargs)
        bound.apply_defaults()
        params = dict(bound.arguments)
        # Drop self/cls for methods
        names = list(sig.parameters)
        if names and names[0] in ("self", "cls"):
            params.pop(names[0], None)
        return params
    except TypeError:
        return {"args": list(args), "kwargs": kwargs}


def _build_output(result: Any) -> dict[str, Any] | None:
    if result is None:
        return None
    if isinstance(result, dict):
        return result
    return {"return_value": result}


async def _do_record(
    primitive: str,
    action_name: str,
    input_dict: dict[str, Any],
    output: dict[str, Any] | None,
    error: str | None,
    agent: str | None,
    client: Any | None,
) -> None:
    resolved_client = _state.get_client(client)
    resolved_agent = _state.get_agent(agent)

    action: Action = {
        "action": primitive,
        "input": input_dict,
    }
    if output is not None:
        action["output"] = output
    if error is not None:
        action["error"] = error

    active_session = _state.get_active_session()
    if active_session is not None:
        await active_session.record(action)
    else:
        session = resolved_client.session(agent=resolved_agent, name=action_name)
        await session.record(action)
        await session.end()


def traced(
    primitive: BehavioralPrimitive,
    *,
    agent: str | None = None,
    client: Any | None = None,
    name: str | None = None,
) -> Callable[[F], F]:
    if primitive not in _VALID_PRIMITIVES:
        raise ValueError(
            f"Invalid primitive {primitive!r}. Must be one of: {', '.join(sorted(_VALID_PRIMITIVES))}"
        )

    def decorator(fn: F) -> F:
        action_name = name or fn.__qualname__

        if inspect.iscoroutinefunction(fn):
            @functools.wraps(fn)
            async def async_wrapper(*args: Any, **kwargs: Any) -> Any:
                input_dict = _capture_args(fn, args, kwargs)
                try:
                    result = await fn(*args, **kwargs)
                except Exception as exc:
                    await _do_record(primitive, action_name, input_dict, None, str(exc), agent, client)
                    raise
                await _do_record(primitive, action_name, input_dict, _build_output(result), None, agent, client)
                return result
            return async_wrapper  # type: ignore[return-value]
        else:
            @functools.wraps(fn)
            def sync_wrapper(*args: Any, **kwargs: Any) -> Any:
                try:
                    asyncio.get_running_loop()
                except RuntimeError:
                    pass  # No loop running — safe to use asyncio.run()
                else:
                    raise InvarianceError(
                        "SYNC_TRACE_UNSUPPORTED",
                        "Cannot use @traced on a sync function called from within a running event loop. "
                        "Make the function async, or call it outside an event loop.",
                    )

                input_dict = _capture_args(fn, args, kwargs)
                try:
                    result = fn(*args, **kwargs)
                except Exception as exc:
                    asyncio.run(_do_record(primitive, action_name, input_dict, None, str(exc), agent, client))
                    raise
                asyncio.run(_do_record(primitive, action_name, input_dict, _build_output(result), None, agent, client))
                return result
            return sync_wrapper  # type: ignore[return-value]

    return decorator
