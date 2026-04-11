import pytest
import respx
from httpx import Response
from invariance.client import Invariance


def _mock_routes(router):
    """Set up standard mock routes for run tests."""
    router.post("/v1/sessions").mock(return_value=Response(200, json={}))
    router.post("/v1/trace/events").mock(return_value=Response(200, json={"nodes": []}))
    router.post("/v1/signals").mock(return_value=Response(200, json={}))
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
async def test_usage_emits_token_usage_event():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        trace_route = router.post("/v1/trace/events").mock(
            return_value=Response(200, json={"nodes": []})
        )
        run = await client.run.start(name="test-run")
        await run.usage(
            model="gpt-5.4-mini",
            input_tokens=120,
            output_tokens=30,
            estimated_cost_usd=0.004,
            tags=["llm"],
            custom_attributes={"provider": "openai"},
            custom_headers={"phase": "draft"},
        )

        payload = trace_route.calls[-1].request.content.decode()
        assert '"action_type":"token_usage"' in payload
        assert '"input_tokens":120' in payload
        assert '"output_tokens":30' in payload
        assert '"token_cost":150' in payload
        assert '"provider":"openai"' in payload
    await client.shutdown()


@pytest.mark.asyncio
async def test_context_window_emits_context_window_event():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        trace_route = router.post("/v1/trace/events").mock(
            return_value=Response(200, json={"nodes": []})
        )
        run = await client.run.start(name="test-run")
        await run.context_window(
            label="answer context",
            model="gpt-5.4-mini",
            input_tokens=800,
            truncated=True,
            segments=[{"type": "retrieval", "tokens": 500, "item_count": 4}],
            tags=["context"],
            custom_attributes={"retrieval_count": 4},
            custom_headers={"workflow": "refund"},
        )

        payload = trace_route.calls[-1].request.content.decode()
        assert '"action_type":"context_window"' in payload
        assert '"label":"answer context"' in payload
        assert '"retrieval_count":4' in payload
        assert '"workflow":"refund"' in payload
    await client.shutdown()


@pytest.mark.asyncio
async def test_evaluate_links_failed_signal_to_trace_node():
    client = Invariance.init(api_key="test-key", api_url="https://api.test", agent="test-agent")
    with respx.mock(base_url="https://api.test", assert_all_called=False) as router:
        _mock_routes(router)
        router.post("/v1/trace/events").mock(
            return_value=Response(200, json={"nodes": [{"id": "node-eval"}]})
        )
        signal_route = router.post("/v1/signals").mock(
            return_value=Response(200, json={})
        )
        run = await client.run.start(name="test-run")
        await run.evaluate(
            "policy",
            {"answer": "bad"},
            {"passed": False, "score": 0.2, "details": "missing citation"},
        )

        payload = signal_route.calls[-1].request.content.decode()
        assert '"trace_node_id":"node-eval"' in payload
        assert '"score":0.2' in payload
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
