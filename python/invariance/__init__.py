"""Invariance SDK for Python — record, sign, and verify AI agent actions."""

from .client import Invariance
from .session import Session
from .a2a_channel import A2AChannel
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
from .policy import check_policies, assert_policy
from .normalize import normalize_action_type, to_snake_case, to_camel_case

from .resources import (
    IdentityResource,
    AgentsResource,
    SessionsResource,
    ReceiptsResource,
    ContractsResource,
    A2AResource,
    TraceResource,
    QueryResource,
    MonitorsResource,
    DriftResource,
    TrainingResource,
    TemplatesResource,
    ApiKeysResource,
    UsageResource,
    SearchResource,
    StatusResource,
    NLQueryResource,
    IdentitiesResource,
    EvalsResource,
    FailureClustersResource,
    SuggestionsResource,
)

__all__ = [
    # Client
    "Invariance",
    "Session",
    "A2AChannel",
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
    # Policy
    "check_policies",
    "assert_policy",
    # Normalize
    "normalize_action_type",
    "to_snake_case",
    "to_camel_case",
    # Resources
    "IdentityResource",
    "AgentsResource",
    "SessionsResource",
    "ReceiptsResource",
    "ContractsResource",
    "A2AResource",
    "TraceResource",
    "QueryResource",
    "MonitorsResource",
    "DriftResource",
    "TrainingResource",
    "TemplatesResource",
    "ApiKeysResource",
    "UsageResource",
    "SearchResource",
    "StatusResource",
    "NLQueryResource",
    "IdentitiesResource",
    "EvalsResource",
    "FailureClustersResource",
    "SuggestionsResource",
]
