import type {
  TraceEventInput, BehavioralPrimitive, NodeMetadata,
  TraceNodeCustomHeaders, TraceNodeCustomAttributes,
} from './types/trace.js';
import type { UsageOpts, ContextWindowOpts } from './types/run.js';

// ── Shared options ──

interface BaseTraceOpts {
  session_id: string;
  agent_id: string;
  parent_id?: string;
  span_id?: string;
  duration_ms?: number;
  tags?: string[];
  custom_headers?: TraceNodeCustomHeaders;
  custom_attributes?: TraceNodeCustomAttributes;
  metadata?: Partial<NodeMetadata>;
}

// ── Generic builder ──

export interface BuildTraceEventOpts extends BaseTraceOpts {
  action_type: BehavioralPrimitive | string;
  input?: unknown;
  output?: unknown;
  error?: unknown;
}

export function buildTraceEvent(opts: BuildTraceEventOpts): TraceEventInput {
  const event: TraceEventInput = {
    session_id: opts.session_id,
    agent_id: opts.agent_id,
    action_type: opts.action_type,
  };
  if (opts.input !== undefined) event.input = opts.input;
  if (opts.output !== undefined) event.output = opts.output;
  if (opts.error !== undefined) event.error = opts.error;
  if (opts.parent_id) event.parent_id = opts.parent_id;
  if (opts.span_id) event.span_id = opts.span_id;
  if (opts.duration_ms !== undefined) event.duration_ms = opts.duration_ms;
  if (opts.custom_headers) event.custom_headers = opts.custom_headers;
  if (opts.custom_attributes) event.custom_attributes = opts.custom_attributes;

  const meta: Partial<NodeMetadata> = { ...opts.metadata };
  if (opts.tags) meta.tags = opts.tags;
  if (Object.keys(meta).length > 0) event.metadata = meta;

  return event;
}

// ── Tool invocation ──

export interface BuildToolInvocationOpts extends BaseTraceOpts {
  tool: string;
  args?: unknown;
  result?: unknown;
  error?: unknown;
  latency_ms?: number;
}

export function buildToolInvocationEvent(opts: BuildToolInvocationOpts): TraceEventInput {
  return buildTraceEvent({
    ...opts,
    action_type: 'tool_invocation',
    input: { tool: opts.tool, args: opts.args },
    output: opts.result,
    error: opts.error,
    metadata: {
      ...opts.metadata,
      tool_calls: [opts.tool],
      ...(opts.latency_ms !== undefined ? { execution_ms: opts.latency_ms } : {}),
    },
  });
}

// ── Decision point ──

export interface BuildDecisionOpts extends BaseTraceOpts {
  candidates: string[];
  chosen: string;
  reasoning?: string;
}

export function buildDecisionEvent(opts: BuildDecisionOpts): TraceEventInput {
  return buildTraceEvent({
    ...opts,
    action_type: 'decision_point',
    input: { candidates: opts.candidates },
    output: { chosen: opts.chosen, reasoning: opts.reasoning },
  });
}

// ── Constraint check ──

export interface BuildConstraintCheckOpts extends BaseTraceOpts {
  constraint: string;
  passed: boolean;
  details?: unknown;
}

export function buildConstraintCheckEvent(opts: BuildConstraintCheckOpts): TraceEventInput {
  return buildTraceEvent({
    ...opts,
    action_type: 'constraint_check',
    input: { constraint: opts.constraint },
    output: { passed: opts.passed, details: opts.details },
  });
}

// ── Handoff (sub-agent spawn) ──

export interface BuildHandoffOpts extends BaseTraceOpts {
  target_agent_id: string;
  task?: string;
  context?: unknown;
}

export function buildHandoffEvent(opts: BuildHandoffOpts): TraceEventInput {
  return buildTraceEvent({
    ...opts,
    action_type: 'sub_agent_spawn',
    input: { target_agent_id: opts.target_agent_id, task: opts.task, context: opts.context },
  });
}

// ── Token usage ──

export interface BuildTokenUsageOpts extends BaseTraceOpts {
  usage: UsageOpts;
}

export function buildTokenUsageEvent(opts: BuildTokenUsageOpts): TraceEventInput {
  const { model, input_tokens, output_tokens, ...rest } = opts.usage;
  return buildTraceEvent({
    ...opts,
    action_type: 'token_usage',
    input: { model, input_tokens, output_tokens, ...rest },
    metadata: {
      ...opts.metadata,
      token_cost: input_tokens + output_tokens,
    },
  });
}

// ── Context window ──

export interface BuildContextWindowOpts extends BaseTraceOpts {
  context: ContextWindowOpts;
}

export function buildContextWindowEvent(opts: BuildContextWindowOpts): TraceEventInput {
  const { label, segments, ...metrics } = opts.context;
  return buildTraceEvent({
    ...opts,
    action_type: 'context_window',
    input: { label, ...metrics, ...(segments ? { segments } : {}) },
  });
}
