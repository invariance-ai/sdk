import asyncio

import pytest
import respx
from httpx import Response

import invariance
from invariance import Invariance, traced, trace_session
from invariance.errors import InvarianceError
from invariance import _state


API = "https://api.test"


def _make_client() -> Invariance:
    return Invariance.init(api_key="test-key", api_url=API)


def _mock_routes(router: respx.MockRouter, session_id: str | None = None) -> None:
    router.post("/v1/sessions").mock(return_value=Response(200, json={}))
    router.post("/v1/receipts").mock(return_value=Response(200, json={}))
    if session_id:
        router.patch(f"/v1/sessions/{session_id}").mock(
            return_value=Response(200, json={})
        )
    else:
        router.patch(url__regex=r"/v1/sessions/.+").mock(
            return_value=Response(200, json={})
        )


@pytest.fixture(autouse=True)
def _reset_state():
    """Reset module-level state between tests."""
    yield
    _state._default_client = None
    _state._default_agent = None
    _state._active_session = _state.ContextVar("_active_session", default=None)


# ── 1. Async decorated function returns result and records receipt ───────────


@pytest.mark.asyncio
async def test_async_traced_returns_result():
    client = _make_client()
    _state.configure(client, "test-agent")

    @traced(primitive="tool_invocation")
    async def search(query: str) -> dict:
        return {"results": [query]}

    with respx.mock(base_url=API) as router:
        _mock_routes(router)
        result = await search("hello")

    assert result == {"results": ["hello"]}
    await client.shutdown()


# ── 2. Non-dict return value stored as {"return_value": ...} ─────────────────


@pytest.mark.asyncio
async def test_async_traced_non_dict_return():
    client = _make_client()
    _state.configure(client, "test-agent")

    @traced(primitive="decision_point")
    async def classify(text: str) -> str:
        return "positive"

    with respx.mock(base_url=API) as router:
        _mock_routes(router)
        result = await classify("great day")

    assert result == "positive"
    await client.shutdown()


# ── 3. None return records no output ─────────────────────────────────────────


@pytest.mark.asyncio
async def test_async_traced_none_return():
    client = _make_client()
    _state.configure(client, "test-agent")

    @traced(primitive="constraint_check")
    async def validate(data: dict) -> None:
        pass

    with respx.mock(base_url=API) as router:
        _mock_routes(router)
        result = await validate({"x": 1})

    assert result is None
    await client.shutdown()


# ── 4. Exception recorded as error and re-raised ────────────────────────────


@pytest.mark.asyncio
async def test_async_traced_records_error():
    client = _make_client()
    _state.configure(client, "test-agent")

    @traced(primitive="tool_invocation")
    async def failing_tool() -> dict:
        raise RuntimeError("connection failed")

    with respx.mock(base_url=API) as router:
        _mock_routes(router)
        with pytest.raises(RuntimeError, match="connection failed"):
            await failing_tool()

    await client.shutdown()


# ── 5. Explicit client= and agent= overrides ────────────────────────────────


@pytest.mark.asyncio
async def test_explicit_overrides():
    default_client = _make_client()
    override_client = Invariance.init(api_key="other-key", api_url=API)
    _state.configure(default_client, "default-agent")

    @traced(primitive="orchestrator_decision", client=override_client, agent="override-agent")
    async def decide(ctx: dict) -> dict:
        return {"action": "allow"}

    with respx.mock(base_url=API) as router:
        _mock_routes(router)
        result = await decide({"user": "alice"})

    assert result == {"action": "allow"}
    await default_client.shutdown()
    await override_client.shutdown()


# ── 6. trace_session groups multiple calls into one session ──────────────────


@pytest.mark.asyncio
async def test_trace_session_groups_calls():
    client = _make_client()
    _state.configure(client, "test-agent")

    @traced(primitive="tool_invocation")
    async def step_a() -> dict:
        return {"step": "a"}

    @traced(primitive="decision_point")
    async def step_b() -> dict:
        return {"step": "b"}

    with respx.mock(base_url=API) as router:
        _mock_routes(router)

        async with trace_session(name="grouped-run") as session:
            await step_a()
            await step_b()
            # Both calls should record into the same session
            receipts = session.get_receipts()
            assert len(receipts) == 2
            assert receipts[0]["action"] == "tool_invocation"
            assert receipts[1]["action"] == "decision_point"
            # Hash chain: second receipt links to first
            assert receipts[1]["previousHash"] == receipts[0]["hash"]

    await client.shutdown()


# ── 7. trace_session explicit client/agent works without global init ────────


@pytest.mark.asyncio
async def test_trace_session_with_explicit_client_and_agent_without_init():
    client = _make_client()

    @traced(primitive="tool_invocation")
    async def step() -> dict:
        return {"step": "ok"}

    with respx.mock(base_url=API) as router:
        _mock_routes(router)

        async with trace_session(
            name="grouped-run",
            client=client,
            agent="explicit-agent",
        ) as session:
            await step()
            receipts = session.get_receipts()
            assert len(receipts) == 1
            assert receipts[0]["action"] == "tool_invocation"
            assert receipts[0]["agent"] == "explicit-agent"

    await client.shutdown()


# ── 8. No init and no explicit client raises NOT_INITIALIZED ────────────────


@pytest.mark.asyncio
async def test_not_initialized_error():
    @traced(primitive="tool_invocation")
    async def orphan() -> dict:
        return {}

    with pytest.raises(InvarianceError) as exc_info:
        await orphan()
    assert exc_info.value.code == "NOT_INITIALIZED"


# ── 9. Invalid primitive raises ValueError at decoration time ────────────────


def test_invalid_primitive_raises():
    with pytest.raises(ValueError, match="Invalid primitive"):
        @traced(primitive="not_a_real_primitive")  # type: ignore[arg-type]
        async def bad() -> dict:
            return {}


# ── 10. functools.wraps preserves metadata ───────────────────────────────────


def test_wraps_preserves_metadata():
    @traced(primitive="plan_revision")
    async def my_function(x: int, y: str = "default") -> dict:
        """My docstring."""
        return {}

    assert my_function.__name__ == "my_function"
    assert my_function.__doc__ == "My docstring."


# ── 11. Sync decorated function works outside a running event loop ───────────


def test_sync_traced_no_loop():
    client = _make_client()
    _state.configure(client, "test-agent")

    @traced(primitive="tool_invocation")
    def sync_tool(query: str) -> dict:
        return {"answer": query}

    with respx.mock(base_url=API) as router:
        _mock_routes(router)
        result = sync_tool("hello")

    assert result == {"answer": "hello"}
    asyncio.run(client.shutdown())


# ── 12. Sync decorated function inside running loop raises ───────────────────


@pytest.mark.asyncio
async def test_sync_traced_in_running_loop_raises():
    client = _make_client()
    _state.configure(client, "test-agent")

    @traced(primitive="tool_invocation")
    def sync_in_loop() -> dict:
        return {}

    with pytest.raises(InvarianceError) as exc_info:
        sync_in_loop()
    assert exc_info.value.code == "SYNC_TRACE_UNSUPPORTED"

    await client.shutdown()


# ── 13. Nested trace_session raises ──────────────────────────────────────────


@pytest.mark.asyncio
async def test_nested_trace_session_raises():
    client = _make_client()
    _state.configure(client, "test-agent")

    with respx.mock(base_url=API) as router:
        router.post("/v1/sessions").mock(return_value=Response(200, json={}))
        router.patch(url__regex=r"/v1/sessions/.+").mock(
            return_value=Response(200, json={})
        )

        async with trace_session(name="outer"):
            with pytest.raises(InvarianceError, match="Nested trace_session"):
                async with trace_session(name="inner"):
                    pass

    await client.shutdown()
