import pytest
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
