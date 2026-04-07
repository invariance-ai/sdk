// ── Primary exports ──
export { Invariance } from './client.js';
export { Session } from './session.js';
export { InvarianceError } from './errors.js';
export type { ErrorCode } from './errors.js';

// ── Workflow modules ──
export { Run, RunModule } from './modules/run.js';
export { ResourcesModule } from './modules/resources.js';
export { AdminModule } from './modules/admin.js';
export { ProvenanceModule } from './modules/provenance.js';
export { TracingModule } from './modules/tracing.js';
export { MonitorsModule } from './modules/monitors-module.js';
export { AnalysisModule } from './modules/analysis.js';
export { ImprovementModule } from './modules/improvement.js';

// ── Key helpers ──
export { createReceipt, verifyChain } from './receipt.js';
export {
  buildTraceEvent, buildToolInvocationEvent,
  buildDecisionEvent, buildConstraintCheckEvent, buildHandoffEvent,
} from './trace-builders.js';
export type {
  BuildTraceEventOpts, BuildToolInvocationOpts,
  BuildDecisionOpts, BuildConstraintCheckOpts, BuildHandoffOpts,
} from './trace-builders.js';
export {
  sortedStringify, sha256, computeReceiptHash,
  ed25519Sign, ed25519Verify, generateKeypair, getPublicKey,
  deriveAgentKeypair, bytesToHex, hexToBytes, randomHex,
} from './crypto.js';

// ── Utilities ──
export { checkPolicies, assertPolicy } from './policy.js';
export { A2AChannel } from './a2a-channel.js';
export { MonitorPoller } from './monitor-poller.js';
export { SignalPoller } from './signal-poller.js';
export { normalizeActionType, toSnakeCase, toCamelCase } from './normalize.js';

// ── All types ──
export type * from './types/index.js';
