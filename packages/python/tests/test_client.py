import asyncio

import pytest
import respx
from httpx import Response
from invariance.client import Invariance
from invariance.errors import InvarianceError


class TestInvarianceInit:
    def test_missing_api_key_raises(self):
        with pytest.raises(InvarianceError) as exc_info:
            Invariance.init(api_key="")
        assert exc_info.value.code == "INIT_FAILED"

    def test_invalid_private_key_raises(self):
        with pytest.raises(InvarianceError) as exc_info:
            Invariance.init(api_key="test-key", private_key="not-hex")
        assert exc_info.value.code == "INVALID_KEY"

    def test_valid_init(self):
        from invariance.crypto import generate_keypair
        kp = generate_keypair()
        client = Invariance.init(api_key="test-key", private_key=kp["privateKey"])
        assert client is not None


class TestStaticMethods:
    def test_generate_keypair(self):
        kp = Invariance.generate_keypair()
        assert len(kp["privateKey"]) == 64
        assert len(kp["publicKey"]) == 64

    def test_get_public_key(self):
        kp = Invariance.generate_keypair()
        pub = Invariance.get_public_key(kp["privateKey"])
        assert pub == kp["publicKey"]

    def test_derive_keypair(self):
        kp = Invariance.generate_keypair()
        derived = Invariance.derive_keypair(kp["privateKey"], "org/agent")
        assert len(derived["privateKey"]) == 64
        assert len(derived["publicKey"]) == 64
        assert derived["privateKey"] != kp["privateKey"]


def test_session_can_be_created_outside_running_loop():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    session = client.session(agent="agent-1", name="run-1")

    async def run() -> None:
        with respx.mock(base_url="https://api.test") as router:
            router.post("/v1/sessions").mock(return_value=Response(200, json={}))
            router.post("/v1/receipts").mock(return_value=Response(200, json={}))
            router.patch(f"/v1/sessions/{session.id}").mock(
                return_value=Response(200, json={})
            )

            receipt = await session.record(
                {"action": "search", "input": {"query": "hello"}}
            )
            assert receipt["action"] == "search"

            info = await session.end()
            assert info["status"] == "closed"

        await client.shutdown()

    asyncio.run(run())


@pytest.mark.asyncio
async def test_resources_namespace_covers_dashboard_flows():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")

    with respx.mock(base_url="https://api.test") as router:
        router.get("/v1/trace/anomalies").mock(
            return_value=Response(
                200,
                json={
                    "anomalies": [{"id": "node-1", "session_id": "sess-1"}],
                    "total": 1,
                },
            )
        )
        router.get("/v1/status/live").mock(
            return_value=Response(200, json={"agents": [], "recent_events": []})
        )
        router.get("/v1/trace/sessions/sess-1/verify").mock(
            return_value=Response(200, json={"valid": True})
        )

        anomaly_result = await client.resources.trace.get_anomalies({"limit": 5, "agentId": "agent-1"})
        status_result = await client.resources.status.snapshot()
        verify_result = await client.resources.trace.verify_chain("sess-1")

    assert anomaly_result == {
        "anomalies": [{"id": "node-1", "session_id": "sess-1"}],
        "total": 1,
    }
    assert status_result == {"agents": [], "recent_events": []}
    assert verify_result == {"verified": True, "errors": []}

    await client.shutdown()


def test_removed_convenience_methods_do_not_exist():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    removed = [
        "create_agent", "list_agents", "get_agent", "get_agent_metrics",
        "get_anomaly_feed", "get_trace_nodes", "verify_trace_chain",
        "get_live_status", "connect_live_status",
        "ask_question", "ask_query",
        "get_monitors", "create_monitor", "delete_monitor",
        "get_training_pairs", "create_training_pair",
        "get_eval_suites", "create_eval_suite",
        "get_failure_clusters", "get_suggestions",
        "search_global",
        "list_sessions", "get_session", "verify_session",
        "signup", "create_org",
        "trace", "status", "monitoring", "emit_signal",
    ]
    present = [m for m in removed if hasattr(client, m)]
    assert present == []


def test_surface_cleanup_removes_module_compatibility_helpers():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")

    assert not hasattr(client.tracing, "context")
    assert not hasattr(client.tracing, "log")
    assert not hasattr(client.monitors, "list")
    assert not hasattr(client.monitors, "create")
    assert not hasattr(client.monitors, "emit_signal")


# ── Launch resource helpers ──────────────────────────────────────────────────


@pytest.mark.asyncio
async def test_sessions_create_sends_runtime_and_tags():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        route = router.post("/v1/sessions").mock(
            return_value=Response(200, json={"id": "sess-1", "name": "Test", "status": "open"})
        )
        await client.resources.sessions.create({
            "id": "sess-1",
            "name": "Test",
            "runtime": {"framework": "langchain", "model": "claude-4"},
            "tags": ["mvp", "test"],
        })
        req = route.calls[0].request
        import json
        body = json.loads(req.content)
        assert body["runtime"] == {"framework": "langchain", "model": "claude-4"}
        assert body["tags"] == ["mvp", "test"]
    await client.shutdown()


@pytest.mark.asyncio
async def test_sessions_summary():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.get("/v1/trace/sessions/sess-1/summary").mock(
            return_value=Response(200, json={"session_id": "sess-1", "total_nodes": 5})
        )
        result = await client.resources.sessions.summary("sess-1")
        assert result["session_id"] == "sess-1"
    await client.shutdown()


@pytest.mark.asyncio
async def test_sessions_proof():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.get("/v1/trace/sessions/sess-1/proof").mock(
            return_value=Response(200, json={"verified": True})
        )
        result = await client.resources.sessions.proof("sess-1")
        assert result["verified"] is True
    await client.shutdown()


@pytest.mark.asyncio
async def test_sessions_replay():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.get("/v1/trace/sessions/sess-1/replay").mock(
            return_value=Response(200, json={"events": []})
        )
        result = await client.resources.sessions.replay("sess-1")
        assert result["events"] == []
    await client.shutdown()


@pytest.mark.asyncio
async def test_sessions_signals():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.get("/v1/query/session/sess-1/signals", params={"limit": "10"}).mock(
            return_value=Response(200, json={"session_id": "sess-1", "signals": [{"id": "sig-1"}]})
        )
        result = await client.resources.sessions.signals("sess-1", {"limit": 10})
        assert result["session_id"] == "sess-1"
        assert len(result["signals"]) == 1
    await client.shutdown()


@pytest.mark.asyncio
async def test_query_session_signals():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.get("/v1/query/session/sess-1/signals", params={"limit": "10"}).mock(
            return_value=Response(200, json={"session_id": "sess-1", "signals": []})
        )
        result = await client.resources.query.session_signals("sess-1", {"limit": 10})
        assert result["session_id"] == "sess-1"
    await client.shutdown()


@pytest.mark.asyncio
async def test_evals_launch():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.post("/v1/evals/launch").mock(
            return_value=Response(200, json={"eval_run": {"id": "run-1"}, "experiment_id": None})
        )
        result = await client.resources.evals.launch({
            "mode": "session", "suite_id": "suite-1", "agent_id": "agent-1", "session_ids": ["sess-1"],
        })
        assert result["eval_run"]["id"] == "run-1"
    await client.shutdown()


@pytest.mark.asyncio
async def test_evals_rerun():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.post("/v1/evals/runs/run-1/rerun").mock(
            return_value=Response(200, json={"id": "run-2", "status": "completed"})
        )
        result = await client.resources.evals.rerun("run-1")
        assert result["id"] == "run-2"
    await client.shutdown()


@pytest.mark.asyncio
async def test_evals_list_regressions():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.get("/v1/evals/regressions").mock(
            return_value=Response(200, json=[{"case_id": "case-1"}])
        )
        result = await client.resources.evals.list_regressions({"suite_id": "suite-1"})
        assert result == [{"case_id": "case-1"}]
    await client.shutdown()


@pytest.mark.asyncio
async def test_evals_get_lineage():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        router.get("/v1/evals/lineage").mock(
            return_value=Response(200, json=[{"run_id": "run-1"}])
        )
        result = await client.resources.evals.get_lineage({"suite_id": "suite-1"})
        assert result == [{"run_id": "run-1"}]
    await client.shutdown()


@pytest.mark.asyncio
async def test_evals_accept_improvement_candidate():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        route = router.patch("/v1/evals/improvement-candidates/cand-1").mock(
            return_value=Response(200, json={"id": "cand-1", "status": "accepted"})
        )
        result = await client.resources.evals.accept_improvement_candidate("cand-1")
        assert result["status"] == "accepted"
        import json
        body = json.loads(route.calls[0].request.content)
        assert body == {"status": "accepted"}
    await client.shutdown()


@pytest.mark.asyncio
async def test_evals_reject_improvement_candidate():
    client = Invariance.init(api_key="test-key", api_url="https://api.test")
    with respx.mock(base_url="https://api.test") as router:
        route = router.patch("/v1/evals/improvement-candidates/cand-1").mock(
            return_value=Response(200, json={"id": "cand-1", "status": "rejected"})
        )
        result = await client.resources.evals.reject_improvement_candidate("cand-1")
        assert result["status"] == "rejected"
        import json
        body = json.loads(route.calls[0].request.content)
        assert body == {"status": "rejected"}
    await client.shutdown()
