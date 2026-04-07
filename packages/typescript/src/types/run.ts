import type { TraceNodeCustomHeaders, TraceNodeCustomAttributes } from './trace.js';

export interface RunStartOpts {
  name: string;
  agent?: string;
  tags?: string[];
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
