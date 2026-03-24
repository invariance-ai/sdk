from __future__ import annotations

import hashlib
import json
import os
from typing import Any

import nacl.signing
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from cryptography.hazmat.primitives import hashes

from .errors import InvarianceError


def sorted_stringify(value: Any) -> str:
    """Deterministic JSON serialization with sorted keys.

    CRITICAL: Must produce identical output to the TypeScript SDK's sortedStringify.
    """
    if value is None:
        return "null"
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    if isinstance(value, float):
        if value == int(value) and not (value != value):  # not NaN
            return str(int(value))
        return json.dumps(value)
    if isinstance(value, str):
        return json.dumps(value, ensure_ascii=False)
    if isinstance(value, list):
        return "[" + ",".join(sorted_stringify(el) for el in value) + "]"
    if isinstance(value, dict):
        keys = sorted(value.keys())
        entries: list[str] = []
        for key in keys:
            v = value[key]
            # In TS, undefined values are skipped. Python has no undefined,
            # so we never skip. None maps to null.
            entries.append(json.dumps(key, ensure_ascii=False) + ":" + sorted_stringify(v))
        return "{" + ",".join(entries) + "}"
    return "null"


def sha256(data: str) -> str:
    """SHA-256 hash of a UTF-8 string, returned as lowercase hex."""
    return hashlib.sha256(data.encode("utf-8")).hexdigest()


def compute_receipt_hash(
    *,
    id: str,
    session_id: str,
    agent: str,
    action: str,
    input: Any,
    output: Any = None,
    error: Any = None,
    timestamp: int | str,
    previous_hash: str,
) -> str:
    """Compute SHA-256 hash for a receipt using deterministic serialization."""
    hash_input = sorted_stringify(
        {
            "id": id,
            "sessionId": session_id,
            "agent": agent,
            "action": action,
            "input": input,
            "output": output if output is not None else None,
            "error": error if error is not None else None,
            "timestamp": timestamp,
            "previousHash": previous_hash,
        }
    )
    return sha256(hash_input)


def ed25519_sign(data: str, private_key_hex: str) -> str:
    """Sign data with Ed25519 private key. Returns signature as hex string."""
    msg_bytes = data.encode("utf-8")
    priv_key_bytes = hex_to_bytes(private_key_hex)
    signing_key = nacl.signing.SigningKey(priv_key_bytes)
    signed = signing_key.sign(msg_bytes)
    return bytes_to_hex(signed.signature)


def ed25519_verify(data: str, signature_hex: str, public_key_hex: str) -> bool:
    """Verify Ed25519 signature. Returns True if valid."""
    try:
        if len(signature_hex) != 128 or len(public_key_hex) != 64:
            return False
        import re
        if not re.fullmatch(r"[0-9a-fA-F]+", signature_hex):
            return False
        if not re.fullmatch(r"[0-9a-fA-F]+", public_key_hex):
            return False
        sig_bytes = hex_to_bytes(signature_hex)
        msg_bytes = data.encode("utf-8")
        pub_key_bytes = hex_to_bytes(public_key_hex)
        verify_key = nacl.signing.VerifyKey(pub_key_bytes)
        verify_key.verify(msg_bytes, sig_bytes)
        return True
    except Exception:
        return False


def generate_keypair() -> dict[str, str]:
    """Generate a new Ed25519 keypair. Returns {'privateKey': hex, 'publicKey': hex}."""
    signing_key = nacl.signing.SigningKey.generate()
    private_key = bytes_to_hex(bytes(signing_key))
    public_key = bytes_to_hex(bytes(signing_key.verify_key))
    return {"privateKey": private_key, "publicKey": public_key}


def get_public_key(private_key_hex: str) -> str:
    """Derive the public key from a private key hex string."""
    priv_bytes = hex_to_bytes(private_key_hex)
    signing_key = nacl.signing.SigningKey(priv_bytes)
    return bytes_to_hex(bytes(signing_key.verify_key))


def derive_agent_keypair(owner_private_key_hex: str, identity: str) -> dict[str, str]:
    """Derive a child keypair using HKDF-SHA256.

    Args:
        owner_private_key_hex: Owner's private key as hex string.
        identity: Identity string (e.g. "org/agent-name").

    Returns:
        {'privateKey': hex, 'publicKey': hex}
    """
    owner_bytes = hex_to_bytes(owner_private_key_hex)
    info = identity.encode("utf-8")
    hkdf = HKDF(
        algorithm=hashes.SHA256(),
        length=32,
        salt=None,
        info=info,
    )
    derived = hkdf.derive(owner_bytes)
    private_key = bytes_to_hex(derived)
    public_key = get_public_key(private_key)
    return {"privateKey": private_key, "publicKey": public_key}


def bytes_to_hex(b: bytes) -> str:
    """Convert bytes to lowercase hex string."""
    return b.hex()


def hex_to_bytes(hex_str: str) -> bytes:
    """Convert hex string to bytes."""
    if len(hex_str) % 2 != 0:
        raise InvarianceError("CRYPTO_ERROR", "Hex string must have even length")
    return bytes.fromhex(hex_str)


def random_hex(length: int) -> str:
    """Generate random hex string of given byte length."""
    return os.urandom(length).hex()
