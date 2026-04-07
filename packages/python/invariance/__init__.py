"""Invariance SDK for Python -- record, sign, and verify AI agent actions."""

from __future__ import annotations

from typing import Callable

from .client import Invariance
from .session import Session
from .modules.run import Run, RunModule
from .modules.resources import ResourcesModule
from .modules.admin import AdminModule
from .modules.provenance import ProvenanceModule
from .modules.tracing import TracingModule
from .modules.monitors_module import MonitorsModule
from .modules.analysis import AnalysisModule
from .modules.improvement import ImprovementModule
from .receipt import create_receipt, verify_chain
from .crypto import (
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
from .errors import InvarianceError
from .normalize import normalize_action_type, to_snake_case, to_camel_case
from .a2a_channel import A2AChannel
from .traced import traced
from ._trace_session import trace_session
from .types import BehavioralPrimitive
from . import _state


def init(
    *,
    api_key: str,
    agent: str,
    api_url: str | None = None,
    private_key: str | None = None,
    instrumentation: dict | None = None,
    flush_interval_ms: int | None = None,
    max_batch_size: int | None = None,
    max_queue_size: int | None = None,
    on_error: Callable[[InvarianceError], None] | None = None,
) -> Invariance:
    """Initialize a default Invariance client and store it for use by @traced."""
    client = Invariance.init(
        api_key=api_key,
        agent=agent,
        api_url=api_url,
        private_key=private_key,
        instrumentation=instrumentation,
        flush_interval_ms=flush_interval_ms,
        max_batch_size=max_batch_size,
        max_queue_size=max_queue_size,
        on_error=on_error,
    )
    _state.configure(client, agent)
    return client


__all__ = [
    # Client
    "Invariance",
    "Session",
    "A2AChannel",
    # Modules
    "Run",
    "RunModule",
    "ResourcesModule",
    "AdminModule",
    "ProvenanceModule",
    "TracingModule",
    "MonitorsModule",
    "AnalysisModule",
    "ImprovementModule",
    # Receipt
    "create_receipt",
    "verify_chain",
    # Crypto
    "sorted_stringify",
    "sha256",
    "compute_receipt_hash",
    "ed25519_sign",
    "ed25519_verify",
    "generate_keypair",
    "get_public_key",
    "derive_agent_keypair",
    "bytes_to_hex",
    "hex_to_bytes",
    "random_hex",
    # Errors
    "InvarianceError",
    # Normalize
    "normalize_action_type",
    "to_snake_case",
    "to_camel_case",
    # Tracing decorator
    "init",
    "traced",
    "trace_session",
    "BehavioralPrimitive",
]
