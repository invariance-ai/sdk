import type { TraceNodeCustomHeaders, TraceNodeCustomAttributes } from './trace.js';
import type { SessionRuntimeMetadata } from './session.js';

export interface RunStartOpts {
  name: string;
  agent?: string;
  tags?: string[];
  runtime?: SessionRuntimeMetadata;
  custom_attributes?: TraceNodeCustomAttributes;
}

export type RunStatus = 'closed' | 'tampered' | 'failed' | 'cancelled';

export interface RunSummary {
  session_id: string;
  duration_ms: number;
  event_count: number;
  receipt_count: number;
  status: RunStatus;
}

export interface StepOpts {
  tags?: string[];
  custom_attributes?: TraceNodeCustomAttributes;
  custom_headers?: TraceNodeCustomHeaders;
}

// ── Token & context tracking ──

export interface UsageOpts {
  model: string;
  input_tokens: number;
  output_tokens: number;
  cached_tokens?: number;
  reasoning_tokens?: number;
  estimated_cost_usd?: number;
}

export interface ContextSegment {
  type: string;
  label?: string;
  tokens: number;
  item_count?: number;
  ids?: string[];
  source?: string;
  content?: unknown;
  metadata?: Record<string, unknown>;
}

export interface ContextWindowOpts {
  label: string;
  model: string;
  input_tokens: number;
  output_tokens?: number;
  budget_tokens?: number;
  truncated?: boolean;
  segments?: ContextSegment[];
}
