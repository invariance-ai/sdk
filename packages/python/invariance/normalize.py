from __future__ import annotations

from typing import Any

_LEGACY_ACTION_MAP: dict[str, str] = {
    "DecisionPoint": "decision_point",
    "decision_point": "decision_point",
    "OrchestratorDecision": "orchestrator_decision",
    "orchestrator_decision": "orchestrator_decision",
    "ToolCall": "tool_invocation",
    "ToolInvocation": "tool_invocation",
    "tool_invocation": "tool_invocation",
    "tool_call": "tool_invocation",
    "SubAgentSpawn": "sub_agent_spawn",
    "sub_agent_spawn": "sub_agent_spawn",
    "GoalDrift": "goal_drift",
    "goal_drift": "goal_drift",
    "ConstraintCheck": "constraint_check",
    "constraint_check": "constraint_check",
    "PlanRevision": "plan_revision",
    "plan_revision": "plan_revision",
    "TraceStep": "trace_step",
    "trace_step": "trace_step",
    "ContextWindow": "context_window",
    "context_window": "context_window",
    "TokenUsage": "token_usage",
    "token_usage": "token_usage",
    "A2ASend": "a2a_send",
    "a2a_send": "a2a_send",
    "A2AReceive": "a2a_receive",
    "a2a_receive": "a2a_receive",
}

_FIELD_MAP: dict[str, str] = {
    "nodeId": "node_id",
    "sessionId": "session_id",
    "agentId": "agent_id",
    "parentId": "parent_id",
    "spanId": "span_id",
    "actionType": "action_type",
    "previousHash": "previous_hash",
    "contextHash": "context_hash",
    "anomalyScore": "anomaly_score",
    "durationMs": "duration_ms",
}

_REVERSE_FIELD_MAP: dict[str, str] = {v: k for k, v in _FIELD_MAP.items()}


def normalize_action_type(action: str) -> str:
    """Normalize a camelCase or legacy action name to a canonical BehavioralPrimitive."""
    return _LEGACY_ACTION_MAP.get(action, action)


def to_snake_case(obj: dict[str, Any]) -> dict[str, Any]:
    """Convert known camelCase field names to snake_case."""
    return {_FIELD_MAP.get(k, k): v for k, v in obj.items()}


def to_camel_case(obj: dict[str, Any]) -> dict[str, Any]:
    """Convert known snake_case field names to camelCase."""
    return {_REVERSE_FIELD_MAP.get(k, k): v for k, v in obj.items()}
