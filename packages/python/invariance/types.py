from __future__ import annotations

from typing import Any, Literal, TypedDict


# ── Config ──────────────────────────────────────────────────────────────────

class Action(TypedDict, total=False):
    agent: str
    action: str  # required but total=False for flexibility
    input: dict[str, Any]
    output: dict[str, Any]
    error: str


# ── Receipt ─────────────────────────────────────────────────────────────────

class Receipt(TypedDict, total=False):
    id: str
    sessionId: str
    agent: str
    action: str
    input: dict[str, Any]
    output: dict[str, Any]
    error: str
    timestamp: int
    hash: str
    previousHash: str
    signature: str
    contractId: str
    counterAgentId: str
    counterSignature: str


class ReceiptQuery(TypedDict, total=False):
    sessionId: str
    action: str
    agent: str
    fromTimestamp: int
    toTimestamp: int
    limit: int
    offset: int


# ── Session ─────────────────────────────────────────────────────────────────

class SessionInfo(TypedDict):
    id: str
    name: str
    agent: str
    status: Literal["open", "closed", "tampered"]
    receiptCount: int
    rootHash: str | None
    closeHash: str | None


class RemoteSession(TypedDict, total=False):
    id: str
    name: str
    created_by: str
    status: Literal["open", "closed", "tampered"]
    created_at: str
    closed_at: str | None
    root_hash: str | None
    close_hash: str | None
    receipt_count: int


class SessionCreateOpts(TypedDict, total=False):
    id: str
    agent: str
    name: str


class SessionListOpts(TypedDict, total=False):
    status: str
    limit: int
    offset: int
    since: int
    until: int


# ── Agent ───────────────────────────────────────────────────────────────────

class AgentRecord(TypedDict):
    id: str
    name: str
    api_key: str
    public_key: str
    created_at: str


class AgentMetrics(TypedDict):
    agent_id: str
    name: str
    run_count: int
    executions: int
    tool_calls: int
    avg_latency_ms: float
    p95_latency_ms: float
    anomaly_rate: float
    error_rate: float
    last_active: str
    avg_anomaly: float


class AgentActionTemplate(TypedDict, total=False):
    action: str
    label: str
    category: str
    icon: str
    highlights: list[str]
    input_schema: dict[str, Any]
    output_schema: dict[str, Any]
    description: str


class AgentActionPolicy(TypedDict, total=False):
    id: str
    agent_id: str
    action: str
    effect: Literal["allow", "deny"]


# ── Contract ────────────────────────────────────────────────────────────────

class Contract(TypedDict, total=False):
    id: str
    requestor_id: str
    provider_id: str
    session_id: str
    terms: dict[str, Any]
    terms_hash: str
    requestor_signature: str
    provider_signature: str | None
    status: Literal["proposed", "accepted", "active", "settled", "disputed", "expired"]
    settlement_hash: str | None
    settlement_proof: dict[str, Any] | None
    requestor_identity: str | None
    provider_identity: str | None
    created_at: str
    updated_at: str


class ContractProposeOpts(TypedDict, total=False):
    providerId: str
    terms: dict[str, Any]
    privateKey: str
    requestorIdentity: str
    providerIdentity: str


class ContractDeliverOpts(TypedDict):
    outputData: dict[str, Any]
    privateKey: str


class DeliveryProof(TypedDict, total=False):
    id: str
    contract_id: str
    provider_id: str
    output_hash: str
    output_data: dict[str, Any]
    signature: str
    status: Literal["pending", "accepted", "rejected"]
    requestor_signature: str | None
    created_at: str


class SettlementProof(TypedDict, total=False):
    contractId: str
    sessionId: str
    chainValid: bool
    termsHash: str
    deliveryHash: str
    signatures: dict[str, str]
    timestamp: int


# ── Trace ───────────────────────────────────────────────────────────────────

BehavioralPrimitive = Literal[
    "decision_point",
    "orchestrator_decision",
    "tool_invocation",
    "sub_agent_spawn",
    "goal_drift",
    "constraint_check",
    "plan_revision",
    "a2a_send",
    "a2a_receive",
]


class NodeMetadata(TypedDict, total=False):
    depth: int
    branch_factor: int
    execution_ms: float
    token_cost: float
    tool_calls: list[str]
    semantic_context: str
    tags: list[str]
    context_inputs: list[dict[str, Any]]
    dependency_edges: list[dict[str, Any]]
    dependency_context: dict[str, Any]


class TraceNode(TypedDict, total=False):
    id: str
    session_id: str
    parent_id: str | None
    span_id: str
    agent_id: str
    action_type: str
    input: Any
    output: Any
    error: Any
    metadata: NodeMetadata
    timestamp: int
    duration_ms: float
    hash: str
    previous_hash: str
    context_hash: str
    children_hashes: list[str]
    signature: str | None
    anomaly_score: float


class TraceEventInput(TypedDict, total=False):
    session_id: str
    agent_id: str
    action_type: str
    input: Any
    output: Any
    error: Any
    parent_id: str
    span_id: str
    duration_ms: float
    metadata: dict[str, Any]


class ReplayTimelineEntry(TypedDict):
    node_id: str
    action_type: str
    timestamp: int
    duration_ms: float
    anomaly_score: float
    input: Any
    output: Any


class ReplaySnapshot(TypedDict, total=False):
    snapshot: dict[str, Any] | None


class CausalChain(TypedDict):
    nodes: list[TraceNode]
    anomaly_flags: list[dict[str, Any]]
    root_cause_node_id: str | None


class AnomalyQuery(TypedDict, total=False):
    minScore: float
    limit: int
    offset: int
    agentId: str
    sessionId: str
    since: int
    until: int


class CounterfactualRequest(TypedDict, total=False):
    branch_from_node_id: str
    modified_input: Any
    modified_action_type: str
    tag: str


class CounterfactualResult(TypedDict):
    original_node_id: str
    counterfactual_node_id: str
    branch_session_id: str
    replay_node_id: str
    tag: str


class AuditResult(TypedDict):
    audit_session_id: str
    audit_agent_id: str
    root_cause_node_id: str
    findings: Any


class GraphPattern(TypedDict):
    pattern_id: str
    action_type: str
    occurrences: int
    first_seen: str
    last_seen: str
    outcome_distribution: dict[str, int]


class PatternQuery(TypedDict, total=False):
    agentId: str
    actionType: str
    limit: int
    since: int
    until: int


class GraphSnapshot(TypedDict):
    nodes: list[Any]
    edges: list[Any]


class NodeDiff(TypedDict):
    diff: Any


# ── A2A ─────────────────────────────────────────────────────────────────────

class A2AConversation(TypedDict, total=False):
    id: str
    agent_a_id: str
    agent_a: str
    agent_b_id: str
    agent_b: str
    participants: list[dict[str, str]]
    session_ids: list[str]
    message_count: int
    started_at: int
    last_message_at: int
    status: Literal["active", "completed"]
    all_countersigned: bool
    pending_count: int
    verified_count: int
    topic: str
    protocol: str
    root_trace_node_id: str | None
    parent_trace_node_id: str | None
    latest_message_preview: str


class A2AMessage(TypedDict, total=False):
    id: str
    conversation_id: str
    message_id: str
    parent_message_id: str | None
    trace_node_id: str | None
    parent_trace_node_id: str | None
    session_ids: list[str]
    from_agent_id: str
    to_agent_id: str
    from_agent_name: str
    to_agent_name: str
    timestamp: int
    status: Literal["pending", "verified"]
    verified: bool
    sender_signature: str | None
    receiver_signature: str | None
    hash: str
    previous_hash: str
    payload_hash: str | None
    content: str
    content_preview: str
    message_type: str
    protocol: str
    metadata: dict[str, Any]


class A2APeer(TypedDict):
    agent_id: str
    agent_name: str
    sent: int
    received: int
    pending: int
    verified: int


class A2AConversationListOpts(TypedDict, total=False):
    agent_id: str


# ── Monitor ─────────────────────────────────────────────────────────────────

class Monitor(TypedDict, total=False):
    id: str
    name: str
    natural_language: str
    compiled_condition: Any
    definition: dict[str, Any] | None
    agent_id: str | None
    owner_id: str
    status: Literal["active", "paused", "disabled"]
    severity: Literal["low", "medium", "high", "critical"]
    webhook_url: str | None
    triggers_count: int
    last_triggered: str | None
    created_at: str
    updated_at: str


class CreateMonitorBody(TypedDict, total=False):
    name: str
    natural_language: str
    definition: dict[str, Any]
    agent_id: str
    severity: Literal["low", "medium", "high", "critical"]
    webhook_url: str


class UpdateMonitorBody(TypedDict, total=False):
    name: str
    natural_language: str
    definition: dict[str, Any] | None
    status: Literal["active", "paused", "disabled"]
    severity: Literal["low", "medium", "high", "critical"]
    webhook_url: str
    agent_id: str


class MonitorListOpts(TypedDict, total=False):
    status: str
    agent_id: str
    target: Literal["trace_node", "session", "signal"]
    mode: Literal["structured", "natural_language"]


class MonitorValidateResult(TypedDict, total=False):
    valid: bool
    errors: list[str]


class MonitorEvaluateResult(TypedDict):
    monitor_id: str
    target: Literal["trace_node", "session", "signal"]
    matches_found: int
    matched_ids: list[str]
    matched_node_ids: list[str]


class MonitorSignal(TypedDict):
    id: str
    monitor_id: str
    monitor_name: str
    node_id: str
    session_id: str
    agent_id: str
    severity: str
    message: str
    acknowledged: bool
    created_at: str


class MonitorEventsQuery(TypedDict, total=False):
    monitor_id: str
    after_id: str
    limit: int
    acknowledged: bool


class MonitorCompilePreview(TypedDict):
    compiled: Any


# ── Query ───────────────────────────────────────────────────────────────────

class NLQueryResult(TypedDict, total=False):
    answer: str
    sources: list[Any]


class TraceQueryOpts(TypedDict, total=False):
    query: str
    session_id: str
    agent_id: str
    limit: int
    llm: bool


class StructuredTraceQuery(TypedDict, total=False):
    action_type: str
    agent_id: str
    session_id: str
    from_timestamp: int
    to_timestamp: int
    min_anomaly_score: float
    has_error: bool
    limit: int


class TraceQueryResult(TypedDict):
    data: list[TraceNode]
    query: str
    total: int


class StatsResult(TypedDict):
    data: list[dict[str, Any]]


class StatsQuery(TypedDict, total=False):
    session_id: str
    agent_id: str


class AgentNote(TypedDict, total=False):
    id: str
    key: str
    owner_id: str
    content: str
    session_id: str | None
    node_id: str | None
    expires_at: str | None
    created_at: str


class WriteNoteOpts(TypedDict, total=False):
    key: str
    content: str
    session_id: str
    node_id: str
    ttl_hours: int


class ToolSchema(TypedDict):
    name: str
    description: str
    inputSchema: dict[str, Any]


class QueryScope(TypedDict, total=False):
    session_id: str
    agent_id: str


# ── Drift ───────────────────────────────────────────────────────────────────

class DriftCatch(TypedDict):
    id: str
    session_a: str
    session_b: str
    agent: str
    task: str
    similarity_score: float
    divergence_reason: str
    caught_at: str
    severity: str


class DriftComparison(TypedDict, total=False):
    run_a: Any
    run_b: Any
    divergence_point: Any
    divergence_reason: str
    similarity_score: float
    aligned_steps: list[Any]


class DriftComparisonQuery(TypedDict, total=False):
    session_a: str
    session_b: str


# ── Identity ────────────────────────────────────────────────────────────────

class DeveloperIdentity(TypedDict):
    handle: str
    public_key: str
    private_key: str
    api_key: str


class OrgIdentity(TypedDict):
    name: str
    public_key: str
    private_key: str
    api_key: str


class AgentIdentity(TypedDict):
    owner: str
    name: str
    public_key: str
    agent_id: str
    created_at: str


class IdentityRecord(TypedDict, total=False):
    id: str
    name: str
    owner: str
    type: str
    public_key: str
    session_count: int
    created_at: str


class SignupOpts(TypedDict):
    email: str
    name: str
    handle: str


class RegisterAgentOpts(TypedDict):
    name: str
    public_key: str


# ── Training ────────────────────────────────────────────────────────────────

class TrainingPair(TypedDict, total=False):
    id: str
    source_agent: str
    student_agent: str
    source_sessions: list[str]
    status: str
    progress: float
    traces_shared: int
    improvements: int
    created_at: str
    updated_at: str


class CreateTrainingPairBody(TypedDict, total=False):
    source_agent: str
    student_agent: str
    source_sessions: list[str]


class UpdateTrainingPairBody(TypedDict, total=False):
    status: str
    progress: float
    traces_shared: int
    improvements: int
    source_sessions: list[str]


class TraceFlag(TypedDict, total=False):
    id: str
    trace_node_id: str
    session_id: str
    agent_id: str
    flag: Literal["good", "bad", "needs_review"]
    notes: str | None
    flagged_by: str
    created_at: str
    updated_at: str


class CreateTraceFlagBody(TypedDict, total=False):
    trace_node_id: str
    flag: Literal["good", "bad", "needs_review"]
    notes: str


class UpdateTraceFlagBody(TypedDict, total=False):
    flag: Literal["good", "bad", "needs_review"]
    notes: str | None


class TraceFlagStats(TypedDict):
    total: int
    good: int
    bad: int
    needs_review: int
    by_agent: dict[str, dict[str, int]]


class TraceFlagQuery(TypedDict, total=False):
    session_id: str
    agent_id: str
    flag: str
    limit: int
    offset: int


# ── Eval ────────────────────────────────────────────────────────────────────

class EvalSuite(TypedDict, total=False):
    id: str
    name: str
    description: str | None
    agent_id: str | None
    created_at: str
    updated_at: str


class CreateEvalSuiteBody(TypedDict, total=False):
    name: str
    description: str
    agent_id: str


class EvalCase(TypedDict, total=False):
    id: str
    suite_id: str
    name: str
    type: str
    assertion_config: dict[str, Any] | None
    judge_config: dict[str, Any] | None
    weight: float
    created_at: str


class CreateEvalCaseBody(TypedDict, total=False):
    name: str
    type: str
    assertion_config: dict[str, Any]
    judge_config: dict[str, Any]
    weight: float


class EvalRun(TypedDict, total=False):
    id: str
    suite_id: str
    agent_id: str
    status: Literal["pending", "running", "completed", "failed"]
    version_label: str | None
    score: float | None
    started_at: str
    completed_at: str | None


class RunEvalBody(TypedDict, total=False):
    agent_id: str
    version_label: str
    session_ids: list[str]


class EvalCaseResult(TypedDict, total=False):
    id: str
    run_id: str
    case_id: str
    case_name: str
    passed: bool
    score: float | None
    details: dict[str, Any] | None


class EvalCompareResult(TypedDict):
    suite_id: str
    run_a: EvalRun
    run_b: EvalRun
    regressions: list[EvalCaseResult]
    improvements: list[EvalCaseResult]
    unchanged: list[EvalCaseResult]


class EvalThreshold(TypedDict, total=False):
    id: str
    suite_id: str
    metric: str
    operator: Literal["gte", "lte", "gt", "lt", "eq"]
    value: float
    created_at: str


class CreateEvalThresholdBody(TypedDict):
    suite_id: str
    metric: str
    operator: Literal["gte", "lte", "gt", "lt", "eq"]
    value: float


# ── Misc ────────────────────────────────────────────────────────────────────

class SearchResult(TypedDict):
    type: Literal["session", "agent"]
    id: str
    label: str
    subtitle: str


class UsageEvent(TypedDict, total=False):
    id: str
    developer_id: str | None
    org_id: str | None
    event_type: Literal["receipt", "trace_node", "contract", "api_call"]
    agent_identity: str | None
    quantity: int
    metadata: dict[str, Any]
    created_at: str


class UsageQuery(TypedDict, total=False):
    event_type: str
    from_: str  # 'from' is reserved in Python
    to: str
    limit: int


class ApiKeyRecord(TypedDict, total=False):
    id: str
    name: str
    key: str
    scopes: list[str]
    created_at: str
    revoked_at: str | None


class CreateApiKeyBody(TypedDict, total=False):
    name: str
    scopes: list[str]


class TemplatePack(TypedDict):
    id: str
    name: str
    description: str
    monitors: list[Any]


class TemplateApplyResult(TypedDict):
    pack_id: str
    monitors_created: int
    monitors: list[Any]


class VerifyResult(TypedDict):
    valid: bool
    receipt_count: int
    errors: list[str]


class HealthResponse(TypedDict):
    ok: bool
    version: str


LiveStatusEventType = Literal[
    "session_created",
    "session_closed",
    "receipt_submitted",
    "monitor_triggered",
    "trace_node_created",
    "signal_created",
]


class LiveStatusEvent(TypedDict, total=False):
    id: str
    type: str
    timestamp: int
    session_id: str
    agent_id: str
    payload: dict[str, Any]


class LiveStatusAgentSummary(TypedDict):
    agent_id: str
    active_sessions: int
    last_action_type: str
    last_action_at: int
    recent_errors: int


class LiveStatusSnapshot(TypedDict):
    agents: list[LiveStatusAgentSummary]
    recent_events: list[LiveStatusEvent]


# ── Failure Clusters ─────────────────────────────────────────────────────────


class FailureClusterMember(TypedDict, total=False):
    id: str
    cluster_id: str
    trace_node_id: str
    session_id: str
    added_at: str


class FailureCluster(TypedDict, total=False):
    id: str
    agent_id: str
    cluster_type: str
    label: str
    description: str | None
    severity: str
    occurrence_count: int
    status: str
    resolution_notes: str | None
    first_seen: str | None
    last_seen: str | None
    owner_id: str
    created_at: str
    updated_at: str
    member_count: int
    members: list[FailureClusterMember]


class CreateFailureClusterBody(TypedDict, total=False):
    agent_id: str
    cluster_type: str
    label: str
    description: str
    severity: str


class UpdateFailureClusterBody(TypedDict, total=False):
    status: str
    resolution_notes: str
    label: str
    description: str
    severity: str


class FailureClusterListOpts(TypedDict, total=False):
    agent_id: str
    status: str
    cluster_type: str


class AddClusterMemberBody(TypedDict, total=False):
    trace_node_id: str
    session_id: str


# ── Optimization Suggestions ─────────────────────────────────────────────────


class OptimizationSuggestion(TypedDict, total=False):
    id: str
    agent_id: str
    suggestion_type: str
    title: str
    description: str
    cluster_id: str | None
    confidence: float
    evidence: dict[str, Any]
    status: str
    owner_id: str
    created_at: str


class CreateSuggestionBody(TypedDict, total=False):
    agent_id: str
    suggestion_type: str
    title: str
    description: str
    cluster_id: str
    confidence: float
    evidence: dict[str, Any]


class UpdateSuggestionBody(TypedDict, total=False):
    status: str
    title: str
    description: str
    confidence: float


class SuggestionListOpts(TypedDict, total=False):
    agent_id: str
    status: str
    suggestion_type: str


# ── Trace Chain Verification ─────────────────────────────────────────────────


class TraceChainVerifyResult(TypedDict, total=False):
    valid: bool
    brokenAt: int
    error: str


# -- Signal ----------------------------------------------------------------

SignalSource = Literal["monitor", "anomaly", "emit"]
SignalSeverity = Literal["low", "medium", "high", "critical"]


class Signal(TypedDict, total=False):
    id: str
    source: str  # SignalSource
    severity: str  # SignalSeverity
    owner_id: str
    monitor_id: str | None
    trace_node_id: str | None
    session_id: str | None
    agent_id: str | None
    title: str
    message: str
    matched_value: Any
    metadata: dict[str, Any]
    acknowledged: bool
    acknowledged_at: str | None
    acknowledged_by: str | None
    created_at: str


class SignalQuery(TypedDict, total=False):
    source: str
    severity: str
    agent_id: str
    session_id: str
    monitor_id: str
    acknowledged: bool
    after_id: str
    limit: int


class CreateSignalBody(TypedDict, total=False):
    title: str
    message: str
    severity: str
    agent_id: str
    session_id: str
    trace_node_id: str
    metadata: dict[str, Any]


class BulkAcknowledgeSignalsBody(TypedDict, total=False):
    signal_ids: list[str]
    filter: dict[str, Any]


class SignalStats(TypedDict):
    total: int
    by_source: dict[str, int]
    by_severity: dict[str, int]
    unacknowledged: int
