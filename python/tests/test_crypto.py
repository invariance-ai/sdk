import pytest
from invariance.crypto import (
    sorted_stringify,
    sha256,
    compute_receipt_hash,
    ed25519_sign,
    ed25519_verify,
    generate_keypair,
    get_public_key,
    derive_agent_keypair,
    bytes_to_hex,
    hex_to_bytes,
    random_hex,
)
from invariance.errors import InvarianceError


class TestSortedStringify:
    def test_null(self):
        assert sorted_stringify(None) == "null"

    def test_booleans(self):
        assert sorted_stringify(True) == "true"
        assert sorted_stringify(False) == "false"

    def test_numbers(self):
        assert sorted_stringify(42) == "42"
        assert sorted_stringify(0) == "0"
        assert sorted_stringify(-1) == "-1"

    def test_float_as_int(self):
        assert sorted_stringify(1.0) == "1"
        assert sorted_stringify(0.5) == "0.5"

    def test_strings(self):
        assert sorted_stringify("hello") == '"hello"'
        assert sorted_stringify("") == '""'
        assert sorted_stringify('a"b') == '"a\\"b"'

    def test_arrays(self):
        assert sorted_stringify([1, 2, 3]) == "[1,2,3]"
        assert sorted_stringify([]) == "[]"
        assert sorted_stringify([None, True]) == "[null,true]"

    def test_objects_sorted_keys(self):
        assert sorted_stringify({"b": 2, "a": 1}) == '{"a":1,"b":2}'
        assert sorted_stringify({}) == "{}"

    def test_nested(self):
        val = {"z": [1, {"b": 2, "a": 1}], "a": None}
        result = sorted_stringify(val)
        assert result == '{"a":null,"z":[1,{"a":1,"b":2}]}'


class TestSha256:
    def test_known_hash(self):
        # SHA-256 of empty string
        assert sha256("") == "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"

    def test_hello(self):
        result = sha256("hello")
        assert len(result) == 64
        assert result == "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"


class TestEd25519:
    def test_sign_and_verify(self):
        kp = generate_keypair()
        sig = ed25519_sign("test message", kp["privateKey"])
        assert len(sig) == 128
        assert ed25519_verify("test message", sig, kp["publicKey"])

    def test_verify_wrong_message(self):
        kp = generate_keypair()
        sig = ed25519_sign("test message", kp["privateKey"])
        assert not ed25519_verify("wrong message", sig, kp["publicKey"])

    def test_verify_invalid_inputs(self):
        assert not ed25519_verify("msg", "short", "short")
        assert not ed25519_verify("msg", "zz" * 64, "aa" * 32)

    def test_get_public_key(self):
        kp = generate_keypair()
        pub = get_public_key(kp["privateKey"])
        assert pub == kp["publicKey"]


class TestDeriveKeypair:
    def test_deterministic(self):
        kp = generate_keypair()
        derived1 = derive_agent_keypair(kp["privateKey"], "org/agent-1")
        derived2 = derive_agent_keypair(kp["privateKey"], "org/agent-1")
        assert derived1["privateKey"] == derived2["privateKey"]
        assert derived1["publicKey"] == derived2["publicKey"]

    def test_different_identities(self):
        kp = generate_keypair()
        d1 = derive_agent_keypair(kp["privateKey"], "org/agent-1")
        d2 = derive_agent_keypair(kp["privateKey"], "org/agent-2")
        assert d1["privateKey"] != d2["privateKey"]

    def test_derived_keys_sign_verify(self):
        kp = generate_keypair()
        derived = derive_agent_keypair(kp["privateKey"], "org/agent-1")
        sig = ed25519_sign("hello", derived["privateKey"])
        assert ed25519_verify("hello", sig, derived["publicKey"])


class TestHexUtils:
    def test_roundtrip(self):
        original = b"\x00\x01\x02\xff"
        hex_str = bytes_to_hex(original)
        assert hex_str == "000102ff"
        assert hex_to_bytes(hex_str) == original

    def test_odd_length_raises(self):
        with pytest.raises(InvarianceError) as exc_info:
            hex_to_bytes("abc")
        assert exc_info.value.code == "CRYPTO_ERROR"

    def test_random_hex(self):
        h = random_hex(16)
        assert len(h) == 32


class TestComputeReceiptHash:
    def test_deterministic(self):
        h1 = compute_receipt_hash(
            id="abc",
            session_id="sess-1",
            agent="agent-1",
            action="search",
            input={"query": "hello"},
            output=None,
            error=None,
            timestamp=1000,
            previous_hash="0",
        )
        h2 = compute_receipt_hash(
            id="abc",
            session_id="sess-1",
            agent="agent-1",
            action="search",
            input={"query": "hello"},
            output=None,
            error=None,
            timestamp=1000,
            previous_hash="0",
        )
        assert h1 == h2
        assert len(h1) == 64

    def test_different_input_different_hash(self):
        common = dict(
            id="abc",
            session_id="sess-1",
            agent="agent-1",
            action="search",
            output=None,
            error=None,
            timestamp=1000,
            previous_hash="0",
        )
        h1 = compute_receipt_hash(input={"query": "hello"}, **common)
        h2 = compute_receipt_hash(input={"query": "world"}, **common)
        assert h1 != h2
