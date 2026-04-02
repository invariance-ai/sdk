from __future__ import annotations

from typing import Literal

ErrorCode = Literal[
    "INIT_FAILED",
    "API_ERROR",
    "POLICY_DENIED",
    "CHAIN_BROKEN",
    "SESSION_CLOSED",
    "FLUSH_FAILED",
    "QUEUE_OVERFLOW",
    "SESSION_NOT_READY",
    "CRYPTO_ERROR",
    "INVALID_KEY",
    "NOT_INITIALIZED",
    "SYNC_TRACE_UNSUPPORTED",
]


class InvarianceError(Exception):
    def __init__(
        self,
        code: ErrorCode,
        message: str,
        status_code: int | None = None,
        details: object = None,
    ) -> None:
        super().__init__(message)
        self.code = code
        self.status_code = status_code
        self.details = details
