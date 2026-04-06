from __future__ import annotations

import time
from typing import Any

from ulid import ULID

from .crypto import compute_receipt_hash, ed25519_sign, ed25519_verify
from .types import Receipt


def create_receipt(
    *,
    session_id: str,
    agent: str,
    action: str,
    input: dict[str, Any],
    output: dict[str, Any] | None = None,
    error: str | None = None,
    previous_hash: str,
    private_key: str | None = None,
    contract_id: str | None = None,
    counter_agent_id: str | None = None,
    counter_signature: str | None = None,
) -> Receipt:
    """Create a new receipt with hash and optional Ed25519 signature."""
    receipt_id = str(ULID())
    timestamp = int(time.time() * 1000)

    hash_value = compute_receipt_hash(
        id=receipt_id,
        session_id=session_id,
        agent=agent,
        action=action,
        input=input,
        output=output,
        error=error,
        timestamp=timestamp,
        previous_hash=previous_hash,
    )

    signature = ""
    if private_key:
        signature = ed25519_sign(hash_value, private_key)

    receipt: Receipt = {
        "id": receipt_id,
        "sessionId": session_id,
        "agent": agent,
        "action": action,
        "input": input,
        "timestamp": timestamp,
        "hash": hash_value,
        "previousHash": previous_hash,
        "signature": signature,
    }

    if output is not None:
        receipt["output"] = output
    if error is not None:
        receipt["error"] = error
    if contract_id is not None:
        receipt["contractId"] = contract_id
    if counter_agent_id is not None:
        receipt["counterAgentId"] = counter_agent_id
    if counter_signature is not None:
        receipt["counterSignature"] = counter_signature

    return receipt


def verify_chain(
    receipts: list[Receipt],
    public_key_hex: str | None = None,
) -> dict[str, Any]:
    """Verify a chain of receipts.

    Returns:
        {'valid': bool, 'errors': list[str]}
    """
    errors: list[str] = []

    for i, r in enumerate(receipts):
        # Verify hash chain linkage
        expected_prev_hash = "0" if i == 0 else receipts[i - 1]["hash"]
        if r["previousHash"] != expected_prev_hash:
            errors.append(
                f'Receipt {i} ({r["id"]}): previousHash mismatch. '
                f"Expected {expected_prev_hash}, got {r['previousHash']}"
            )

        # Recompute hash
        recomputed_hash = compute_receipt_hash(
            id=r["id"],
            session_id=r["sessionId"],
            agent=r["agent"],
            action=r["action"],
            input=r["input"],
            output=r.get("output"),
            error=r.get("error"),
            timestamp=r["timestamp"],
            previous_hash=r["previousHash"],
        )

        if recomputed_hash != r["hash"]:
            errors.append(
                f'Receipt {i} ({r["id"]}): hash mismatch. '
                f"Expected {recomputed_hash}, got {r['hash']}"
            )

        # Verify signature if public key provided
        if public_key_hex and r.get("signature"):
            valid = ed25519_verify(r["hash"], r["signature"], public_key_hex)
            if not valid:
                errors.append(f'Receipt {i} ({r["id"]}): invalid signature')

    return {"valid": len(errors) == 0, "errors": errors}
