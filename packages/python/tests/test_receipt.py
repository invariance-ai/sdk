import pytest
from invariance.receipt import create_receipt, verify_chain
from invariance.crypto import generate_keypair


class TestCreateReceipt:
    def test_creates_receipt_with_hash(self):
        r = create_receipt(
            session_id="sess-1",
            agent="agent-1",
            action="search",
            input={"query": "hello"},
            previous_hash="0",
        )
        assert r["id"]
        assert r["sessionId"] == "sess-1"
        assert r["agent"] == "agent-1"
        assert r["action"] == "search"
        assert r["input"] == {"query": "hello"}
        assert len(r["hash"]) == 64
        assert r["previousHash"] == "0"
        assert r["signature"] == ""
        assert r["timestamp"] > 0

    def test_creates_signed_receipt(self):
        kp = generate_keypair()
        r = create_receipt(
            session_id="sess-1",
            agent="agent-1",
            action="search",
            input={"query": "hello"},
            previous_hash="0",
            private_key=kp["privateKey"],
        )
        assert len(r["signature"]) == 128

    def test_optional_fields(self):
        r = create_receipt(
            session_id="sess-1",
            agent="agent-1",
            action="search",
            input={},
            previous_hash="0",
            output={"result": "found"},
            error="some error",
            contract_id="contract-1",
        )
        assert r["output"] == {"result": "found"}
        assert r["error"] == "some error"
        assert r["contractId"] == "contract-1"


class TestVerifyChain:
    def test_valid_chain(self):
        r1 = create_receipt(
            session_id="s", agent="a", action="act1",
            input={"x": 1}, previous_hash="0",
        )
        r2 = create_receipt(
            session_id="s", agent="a", action="act2",
            input={"x": 2}, previous_hash=r1["hash"],
        )
        result = verify_chain([r1, r2])
        assert result["valid"] is True
        assert result["errors"] == []

    def test_broken_chain(self):
        r1 = create_receipt(
            session_id="s", agent="a", action="act1",
            input={"x": 1}, previous_hash="0",
        )
        r2 = create_receipt(
            session_id="s", agent="a", action="act2",
            input={"x": 2}, previous_hash="wrong",
        )
        result = verify_chain([r1, r2])
        assert result["valid"] is False
        assert len(result["errors"]) > 0

    def test_signed_chain_verification(self):
        kp = generate_keypair()
        r1 = create_receipt(
            session_id="s", agent="a", action="act1",
            input={}, previous_hash="0", private_key=kp["privateKey"],
        )
        r2 = create_receipt(
            session_id="s", agent="a", action="act2",
            input={}, previous_hash=r1["hash"], private_key=kp["privateKey"],
        )
        result = verify_chain([r1, r2], kp["publicKey"])
        assert result["valid"] is True

    def test_tampered_hash(self):
        r1 = create_receipt(
            session_id="s", agent="a", action="act1",
            input={}, previous_hash="0",
        )
        r1["hash"] = "0" * 64  # tamper
        result = verify_chain([r1])
        assert result["valid"] is False

    def test_empty_chain(self):
        result = verify_chain([])
        assert result["valid"] is True
