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
