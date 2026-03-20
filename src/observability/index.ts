export { InvarianceTracer } from './tracer.js';
export { TRACE_SCHEMA_VERSION } from './types.js';
export { validateTraceEvent } from './schema-validator.js';
export type { ValidationResult } from './schema-validator.js';
export type {
  TracerConfig,
  TracerMode,
  TraceEvent,
  TraceMetadata,
  BehavioralPrimitive,
  DevOutput,
  DecisionPointPayload,
  GoalDriftPayload,
  SubAgentSpawnPayload,
  ToolInvocationPayload,
  VerificationProof,
  TraceAction,
  ReplaySnapshot,
  ReplayTimelineEntry,
  ReplayContextMode,
  CounterfactualRequest,
  CounterfactualResult,
} from './types.js';
