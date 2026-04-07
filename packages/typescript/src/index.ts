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

// ── Kept at root for compatibility (also available via @invariance/sdk/advanced) ──
export { A2AChannel } from './a2a-channel.js';

// ── Core types (product-facing subset) ──
export type { InvarianceConfig, InstrumentationConfig, Action } from './types/config.js';
export type { RunStartOpts, RunSummary, StepOpts } from './types/run.js';
export type { SessionCreateOpts, SessionInfo } from './types/session.js';
export type { Receipt } from './types/receipt.js';
export type { BehavioralPrimitive, TraceEventInput, TraceNode } from './types/trace.js';
export type { Signal, CreateSignalBody } from './types/signal.js';
export type { Monitor, CreateMonitorBody } from './types/monitor.js';
