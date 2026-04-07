import pytest
import respx
from httpx import Response
from invariance.client import Invariance


def _mock_routes(router):
    """Set up standard mock routes for run tests."""
    router.post("/v1/sessions").mock(return_value=Response(200, json={}))
    router.post("/v1/trace/events").mock(return_value=Response(200, json={"nodes": []}))
    router.route(method="PATCH", path__regex=r"/v1/sessions/.+").mock(
        return_value=Response(200, json={"status": "closed"})
    )
    router.post("/v1/receipts").mock(return_value=Response(200, json={}))


@pytest.mark.asyncio
async def test_start_creates_session():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        assert run.agent == "test-agent"
        assert run.name == "test-run"
        assert run.session_id
    await client.shutdown()


@pytest.mark.asyncio
async def test_log_emits_trace_event():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        await run.log("decision context", {"reason": "customer eligible"})
        # Should not raise — trace event was submitted
    await client.shutdown()


@pytest.mark.asyncio
async def test_log_with_no_data():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        await run.log("checkpoint reached")
    await client.shutdown()


@pytest.mark.asyncio
async def test_log_wraps_non_dict_data():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        await run.log("score", 42)
    await client.shutdown()


@pytest.mark.asyncio
async def test_flush_flushes_pending_provenance_receipts():
    client = Invariance.init(
        api_key="test-key",
        api_url="https://api.test",
        agent="test-agent",
        private_key="a" * 64,
        instrumentation={"provenance": True},
    )
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        receipts_route = router.post("/v1/receipts").mock(
            return_value=Response(200, json={})
        )
        run = await client.run.start(name="test-run")
        await run.log("decision context", {"reason": "customer eligible"})

        assert receipts_route.call_count == 0

        await run.flush()

        assert receipts_route.call_count == 1
    await client.shutdown()


@pytest.mark.asyncio
async def test_log_records_provenance_receipt_when_enabled():
    client = Invariance.init(
        api_key="test-key",
        api_url="https://api.test",
        agent="test-agent",
        private_key="a" * 64,
        instrumentation={"provenance": True},
    )
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        await run.log("decision context", {"reason": "customer eligible"})
        summary = await run.finish()

        assert summary["receipt_count"] == 1
    await client.shutdown()


@pytest.mark.asyncio
async def test_fail_closes_with_failed_status():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        summary = await run.fail(Exception("something broke"))

        assert summary["status"] == "failed"
        assert summary["session_id"] == run.session_id
    await client.shutdown()


@pytest.mark.asyncio
async def test_fail_prevents_further_operations():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        await run.fail("error")

        with pytest.raises(RuntimeError, match="already finished"):
            await run.step("a", lambda: "b")
    await client.shutdown()


@pytest.mark.asyncio
async def test_cancel_closes_with_cancelled_status():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        summary = await run.cancel("user requested")
        assert summary["status"] == "cancelled"
    await client.shutdown()


@pytest.mark.asyncio
async def test_cancel_without_reason():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        summary = await run.cancel()
        assert summary["status"] == "cancelled"
    await client.shutdown()


@pytest.mark.asyncio
async def test_cancel_records_provenance_receipt_without_reason():
    client = Invariance.init(
        api_key="test-key",
        api_url="https://api.test",
        agent="test-agent",
        private_key="a" * 64,
        instrumentation={"provenance": True},
    )
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")
        summary = await run.cancel()

        assert summary["status"] == "cancelled"
        assert summary["receipt_count"] == 1
    await client.shutdown()


@pytest.mark.asyncio
async def test_finish_returns_summary():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        run = await client.run.start(name="test-run")

        async def do_step():
            return "done"

        await run.step("a", do_step)
        summary = await run.finish()

        assert summary["session_id"] == run.session_id
        assert summary["event_count"] == 1
        assert summary["status"] == "closed"
        assert summary["duration_ms"] >= 0
    await client.shutdown()
