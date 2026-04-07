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
