from __future__ import annotations

from typing import Any

from .errors import InvarianceError
from .types import AgentActionPolicy


class PolicyCheckResult:
    __slots__ = ("allowed", "reason")

    def __init__(self, allowed: bool, reason: str | None = None) -> None:
        self.allowed = allowed
        self.reason = reason


def check_policies(
    action: str,
    policies: list[AgentActionPolicy],
) -> PolicyCheckResult:
    """Check whether an action is allowed by the given policies.

    Priority: exact match > prefix wildcard > global wildcard (*).
    No policies = allow by default.
    """

    def specificity(p: AgentActionPolicy) -> int:
        a = p.get("action", "")
        if a == "*":
            return 0
        if a.endswith("*"):
            return 1
        return 2

    matching = [
        p
        for p in policies
        if (
            p.get("action") == "*"
            or (p.get("action", "").endswith("*") and action.startswith(p["action"][:-1]))
            or p.get("action") == action
        )
    ]

    sorted_policies = sorted(matching, key=specificity, reverse=True)

    if not sorted_policies:
        return PolicyCheckResult(allowed=True)

    first = sorted_policies[0]
    if first.get("effect") == "deny":
        return PolicyCheckResult(
            allowed=False,
            reason=f'Action "{action}" denied by policy "{first.get("action")}"',
        )

    return PolicyCheckResult(allowed=True)


def assert_policy(action: str, policies: list[AgentActionPolicy]) -> None:
    """Assert that an action is allowed. Raises InvarianceError if denied."""
    result = check_policies(action, policies)
    if not result.allowed:
        raise InvarianceError(
            "POLICY_DENIED",
            result.reason or f'Action "{action}" denied',
        )
