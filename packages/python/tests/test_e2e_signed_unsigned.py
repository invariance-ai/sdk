"""E2E tests for signed vs unsigned receipt paths in the Python SDK."""
import pytest
from invariance.receipt import create_receipt, verify_chain
from invariance.crypto import (
    generate_keypair,
    compute_receipt_hash,
    ed25519_sign,
    ed25519_verify,
)


class TestUnsignedPaths:
    def test_unsigned_chain_verifies(self):
        """3 unsigned receipts → verify_chain returns valid."""
        r1 = create_receipt(
            session_id="s", agent="a", action="act1",
            input={"x": 1}, previous_hash="0",
        )
        r2 = create_receipt(
            session_id="s", agent="a", action="act2",
            input={"x": 2}, previous_hash=r1["hash"],
        )
        r3 = create_receipt(
            session_id="s", agent="a", action="act3",
            input={"x": 3}, previous_hash=r2["hash"],
        )
        result = verify_chain([r1, r2, r3])
        assert result["valid"] is True
        assert result["errors"] == []

    def test_unsigned_receipts_have_empty_signature(self):
        r = create_receipt(
            session_id="s", agent="a", action="act",
            input={}, previous_hash="0",
        )
        assert r["signature"] == ""

    def test_hash_is_64_hex_chars(self):
        r = create_receipt(
            session_id="s", agent="a", action="act",
            input={}, previous_hash="0",
        )
        assert len(r["hash"]) == 64
        assert all(c in "0123456789abcdef" for c in r["hash"])


class TestSignedPaths:
    def test_signed_chain_verifies_with_public_key(self):
        """3 signed receipts → verify_chain with public key returns valid."""
        kp = generate_keypair()
        r1 = create_receipt(
            session_id="s", agent="a", action="act1",
            input={}, previous_hash="0", private_key=kp["privateKey"],
        )
        r2 = create_receipt(
            session_id="s", agent="a", action="act2",
            input={}, previous_hash=r1["hash"], private_key=kp["privateKey"],
        )
        r3 = create_receipt(
            session_id="s", agent="a", action="act3",
            input={}, previous_hash=r2["hash"], private_key=kp["privateKey"],
        )
        result = verify_chain([r1, r2, r3], kp["publicKey"])
        assert result["valid"] is True
        assert result["errors"] == []

    def test_signed_receipt_has_128_char_signature(self):
        kp = generate_keypair()
        r = create_receipt(
            session_id="s", agent="a", action="act",
            input={}, previous_hash="0", private_key=kp["privateKey"],
        )
        assert len(r["signature"]) == 128

    def test_signature_verifiable_with_public_key(self):
        kp = generate_keypair()
        r = create_receipt(
            session_id="s", agent="a", action="act",
            input={"data": "test"}, previous_hash="0",
            private_key=kp["privateKey"],
        )
        assert ed25519_verify(r["hash"], r["signature"], kp["publicKey"])


class TestMixedChains:
    def test_mixed_unsigned_then_signed_hash_linkage(self):
        """2 unsigned + 2 signed in same session → hash chain valid."""
        kp = generate_keypair()

        r1 = create_receipt(
            session_id="s", agent="a", action="u1",
            input={}, previous_hash="0",
        )
        r2 = create_receipt(
            session_id="s", agent="a", action="u2",
            input={}, previous_hash=r1["hash"],
        )
        r3 = create_receipt(
            session_id="s", agent="a", action="s1",
            input={}, previous_hash=r2["hash"],
            private_key=kp["privateKey"],
        )
        r4 = create_receipt(
            session_id="s", agent="a", action="s2",
            input={}, previous_hash=r3["hash"],
            private_key=kp["privateKey"],
        )

        # Hash chain is intact
        assert r2["previousHash"] == r1["hash"]
        assert r3["previousHash"] == r2["hash"]
        assert r4["previousHash"] == r3["hash"]

        # Full chain verification without public key (only hash linkage)
        result = verify_chain([r1, r2, r3, r4])
        assert result["valid"] is True


class TestTampering:
    def test_tampered_signed_receipt_fails_verification(self):
        """Mutate input after signing → verify_chain detects."""
        kp = generate_keypair()
        r1 = create_receipt(
            session_id="s", agent="a", action="act1",
            input={"secret": "original"}, previous_hash="0",
            private_key=kp["privateKey"],
        )
        r2 = create_receipt(
            session_id="s", agent="a", action="act2",
            input={}, previous_hash=r1["hash"],
            private_key=kp["privateKey"],
        )

        # Tamper with r1's input after signing
        r1["input"] = {"secret": "tampered"}

        result = verify_chain([r1, r2], kp["publicKey"])
        assert result["valid"] is False
        assert len(result["errors"]) > 0

    def test_tampered_hash_detected(self):
        """Directly modify hash → verify_chain catches mismatch."""
        r1 = create_receipt(
            session_id="s", agent="a", action="act1",
            input={}, previous_hash="0",
        )
        original_hash = r1["hash"]
        r1["hash"] = "0" * 64

        result = verify_chain([r1])
        assert result["valid"] is False

    def test_wrong_key_signature_fails(self):
        """Sign with key A, verify with key B → invalid."""
        kp_a = generate_keypair()
        kp_b = generate_keypair()

        r = create_receipt(
            session_id="s", agent="a", action="act",
            input={}, previous_hash="0",
            private_key=kp_a["privateKey"],
        )

        result = verify_chain([r], kp_b["publicKey"])
        assert result["valid"] is False
