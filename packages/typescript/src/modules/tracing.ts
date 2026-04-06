import type { TraceEventInput, TraceNode } from '../types/trace.js';
import { buildTraceEvent } from '../trace-builders.js';
import type { BuildTraceEventOpts } from '../trace-builders.js';
import type { ResourcesModule } from './resources.js';

export class TracingModule {
  private _defaultAgent?: string;

  constructor(
    private _resources: ResourcesModule,
    opts: { agent?: string },
  ) {
    this._defaultAgent = opts.agent;
  }

  /** Submit one or more trace events to the backend. */
  async submit(events: TraceEventInput | TraceEventInput[]): Promise<{ nodes: TraceNode[] }> {
    return this._resources.trace.submitEvents(events);
  }

  /** Build a trace event (does not submit). */
  event(opts: BuildTraceEventOpts): TraceEventInput {
    return buildTraceEvent(opts);
  }

  /** Log a context trace event -- the simplest way to attach data to a session. */
  async context(label: string, value: unknown, opts: {
    session_id: string;
    agent_id?: string;
    parent_id?: string;
    tags?: string[];
  }): Promise<{ nodes: TraceNode[] }> {
    const event = buildTraceEvent({
      session_id: opts.session_id,
      agent_id: opts.agent_id ?? this._defaultAgent ?? '',
      action_type: 'context',
      input: { label },
      output: { value },
      parent_id: opts.parent_id,
      tags: opts.tags,
    });
    return this._resources.trace.submitEvents([event]);
  }

  /** Alias for context(). */
  async log(label: string, value: unknown, opts: {
    session_id: string;
    agent_id?: string;
    parent_id?: string;
    tags?: string[];
  }): Promise<{ nodes: TraceNode[] }> {
    return this.context(label, value, opts);
  }

  // Convenience delegates to TraceResource

  async replay(sessionId: string) { return this._resources.trace.getReplay(sessionId); }
  async audit(sessionId: string, nodeId?: string) { return this._resources.trace.generateAudit(sessionId, nodeId); }
  async graph(opts?: { sessionId?: string }) { return this._resources.trace.getGraphSnapshot(opts); }
  async narrative(sessionId: string) { return this._resources.trace.getNarrative(sessionId); }
  async semanticFacts(sessionId: string) { return this._resources.trace.getSessionSemanticFacts(sessionId); }
  async verify(sessionId: string) { return this._resources.trace.verifyChain(sessionId); }
}
