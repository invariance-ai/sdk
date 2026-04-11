import { ulid } from 'ulid';
import type { Session } from '../session.js';
import type { SessionCreateOpts } from '../types/session.js';
import type { TraceEventInput, TraceNode } from '../types/trace.js';
import type { RunStartOpts, RunSummary, RunStatus, StepOpts, UsageOpts, ContextWindowOpts } from '../types/run.js';
import type { CreateSignalBody, Signal } from '../types/signal.js';
import {
  buildTraceEvent, buildToolInvocationEvent,
  buildDecisionEvent, buildConstraintCheckEvent, buildHandoffEvent,
  buildTokenUsageEvent, buildContextWindowEvent,
} from '../trace-builders.js';
import type { ResourcesModule } from './resources.js';

export interface RunModuleConfig {
  agent?: string;
  privateKey?: string;
  instrumentation?: { traces?: boolean; provenance?: boolean };
  sessionFactory: (opts: SessionCreateOpts) => Session;
  flushPendingWork: () => Promise<void>;
}

export class RunModule {
  constructor(
    private _resources: ResourcesModule,
    private _config: RunModuleConfig,
  ) {}

  /** Start a new instrumented run. Creates a trace session (and provenance session if enabled). */
  async start(opts: RunStartOpts): Promise<Run> {
    const agent = opts.agent ?? this._config.agent;
    if (!agent) {
      throw new Error('agent is required: pass it to run.start() or set it in the Invariance config');
    }

    const sessionId = ulid();
    const tracesEnabled = this._config.instrumentation?.traces !== false;
    const provenanceEnabled = !!(
      this._config.privateKey &&
      this._config.instrumentation?.provenance === true
    );

    // Create provenance session if enabled
    let provenanceSession: Session | undefined;
    if (provenanceEnabled) {
      provenanceSession = this._config.sessionFactory({
        agent,
        name: opts.name,
        id: sessionId,
      });
      await provenanceSession.ready;
    } else {
      await this._resources.sessions.create({
        id: sessionId,
        name: opts.name,
        agent_id: agent,
      });
    }

    return new Run({
      sessionId,
      agent,
      name: opts.name,
      tags: opts.tags,
      resources: this._resources,
      provenanceSession,
      tracesEnabled,
      flushPendingWork: this._config.flushPendingWork,
    });
  }
}

interface RunOpts {
  sessionId: string;
  agent: string;
  name: string;
  tags?: string[];
  resources: ResourcesModule;
  provenanceSession?: Session;
  tracesEnabled: boolean;
  flushPendingWork: () => Promise<void>;
}

export class Run {
  readonly sessionId: string;
  readonly agent: string;
  readonly name: string;

  private _resources: ResourcesModule;
  private _provenanceSession?: Session;
  private _tracesEnabled: boolean;
  private _flushPendingWork: () => Promise<void>;
  private _parentStack: string[] = [];
  private _eventCount = 0;
  private _startTime: number;
  private _tags?: string[];
  private _finished = false;

  constructor(opts: RunOpts) {
    this.sessionId = opts.sessionId;
    this.agent = opts.agent;
    this.name = opts.name;
    this._resources = opts.resources;
    this._provenanceSession = opts.provenanceSession;
    this._tracesEnabled = opts.tracesEnabled;
    this._flushPendingWork = opts.flushPendingWork;
    this._tags = opts.tags;
    this._startTime = Date.now();
  }

  private get _currentParentId(): string | undefined {
    return this._parentStack.length > 0
      ? this._parentStack[this._parentStack.length - 1]
      : undefined;
  }

  private async _submitEvent(event: TraceEventInput): Promise<{ nodes: TraceNode[] }> {
    if (!this._tracesEnabled) {
      return { nodes: [] };
    }
    this._eventCount++;
    return this._resources.trace.submitEvents([event]);
  }

  private async _recordReceipt(action: string, input?: unknown, output?: unknown, error?: string): Promise<void> {
    if (this._provenanceSession) {
      await this._provenanceSession.record({
        action,
        input: (input as Record<string, unknown>) ?? {},
        output: output as Record<string, unknown>,
        error,
      });
    }
  }

  /** Execute a named step, emitting a trace event with timing and parent-child tracking. */
  async step<T>(name: string, fn: () => T | Promise<T>, opts?: StepOpts): Promise<T> {
    this._assertOpen();
    const spanId = ulid();
    const parentId = this._currentParentId;
    this._parentStack.push(spanId);

    const start = Date.now();
    let result: T;
    let error: string | undefined;

    try {
      result = await fn();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      const event = buildTraceEvent({
        session_id: this.sessionId,
        agent_id: this.agent,
        action_type: 'trace_step',
        input: { step: name },
        error,
        parent_id: parentId,
        span_id: spanId,
        duration_ms: Date.now() - start,
        tags: opts?.tags ?? this._tags,
        custom_attributes: opts?.custom_attributes,
        custom_headers: opts?.custom_headers,
      });
      await this._submitEvent(event);
      await this._recordReceipt(name, { step: name }, undefined, error);
      this._parentStack.pop();
      throw err;
    }

    const event = buildTraceEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { step: name },
      output: result !== null && result !== undefined && typeof result === 'object' ? result : { result },
      parent_id: parentId,
      span_id: spanId,
      duration_ms: Date.now() - start,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    await this._submitEvent(event);
    await this._recordReceipt(name, { step: name }, typeof result === 'object' ? result : { result });
    this._parentStack.pop();
    return result;
  }

  /** Execute a tool call, emitting a tool_invocation trace event. */
  async tool<T>(name: string, args: unknown, fn: () => T | Promise<T>, opts?: StepOpts): Promise<T> {
    this._assertOpen();
    const spanId = ulid();
    const parentId = this._currentParentId;
    this._parentStack.push(spanId);

    const start = Date.now();
    let result: T;
    let error: string | undefined;

    try {
      result = await fn();
    } catch (err) {
      error = err instanceof Error ? err.message : String(err);
      const event = buildToolInvocationEvent({
        session_id: this.sessionId,
        agent_id: this.agent,
        tool: name,
        args,
        error,
        parent_id: parentId,
        span_id: spanId,
        latency_ms: Date.now() - start,
        tags: opts?.tags ?? this._tags,
        custom_attributes: opts?.custom_attributes,
        custom_headers: opts?.custom_headers,
      });
      await this._submitEvent(event);
      await this._recordReceipt(`tool:${name}`, args, undefined, error);
      this._parentStack.pop();
      throw err;
    }

    const event = buildToolInvocationEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      tool: name,
      args,
      result,
      parent_id: parentId,
      span_id: spanId,
      latency_ms: Date.now() - start,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    await this._submitEvent(event);
    await this._recordReceipt(`tool:${name}`, args, typeof result === 'object' ? result : { result });
    this._parentStack.pop();
    return result;
  }

  /** Record a decision point, emitting a decision_point trace event. */
  async decision<T>(name: string, context: { candidates: string[]; chosen: string; reasoning?: string }, fn: () => T | Promise<T>, opts?: StepOpts): Promise<T> {
    this._assertOpen();
    const spanId = ulid();
    const parentId = this._currentParentId;
    this._parentStack.push(spanId);

    const start = Date.now();
    let result: T;
    try {
      result = await fn();
    } catch (err) {
      this._parentStack.pop();
      throw err;
    }

    const event = buildDecisionEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      candidates: context.candidates,
      chosen: context.chosen,
      reasoning: context.reasoning,
      parent_id: parentId,
      span_id: spanId,
      duration_ms: Date.now() - start,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    await this._submitEvent(event);
    await this._recordReceipt(`decision:${name}`, context, { chosen: context.chosen });
    this._parentStack.pop();
    return result;
  }

  /** Record a handoff to another agent with optional context delta. */
  async handoff(targetAgent: string, task?: string, opts?: StepOpts & { context_delta?: Record<string, unknown> }): Promise<void> {
    this._assertOpen();
    const event = buildHandoffEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      target_agent_id: targetAgent,
      task,
      context_delta: opts?.context_delta,
      parent_id: this._currentParentId,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    await this._submitEvent(event);
    await this._recordReceipt('handoff', {
      target_agent_id: targetAgent,
      task,
      ...(opts?.context_delta ? { context_delta: opts.context_delta } : {}),
    });
  }

  /** Record a message event. */
  async message(content: unknown, opts?: StepOpts): Promise<void> {
    this._assertOpen();
    const event = buildTraceEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      action_type: 'message',
      output: typeof content === 'object' ? content : { content },
      parent_id: this._currentParentId,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    await this._submitEvent(event);
  }

  /** Record a constraint check. */
  async constraint(name: string, passed: boolean, details?: unknown, opts?: StepOpts): Promise<void> {
    this._assertOpen();
    const event = buildConstraintCheckEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      constraint: name,
      passed,
      details,
      parent_id: this._currentParentId,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    await this._submitEvent(event);
    await this._recordReceipt(`constraint:${name}`, { constraint: name }, { passed });
  }

  /** Log raw context -- the simplest way to attach data to this run. */
  async context(label: string, value: unknown, opts?: StepOpts): Promise<void> {
    this._assertOpen();
    const event = buildTraceEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      action_type: 'context',
      input: { label },
      output: { value },
      parent_id: this._currentParentId,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    await this._submitEvent(event);
  }

  /** Log a simple message or data payload against this run. */
  async log(label: string, data?: unknown, opts?: StepOpts): Promise<void> {
    this._assertOpen();
    const output = data !== undefined
      ? (typeof data === 'object' && data !== null ? data : { value: data })
      : undefined;
    const event = buildTraceEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { label },
      output,
      parent_id: this._currentParentId,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    await this._submitEvent(event);
    await this._recordReceipt(`log:${label}`, { label }, output);
  }

  /** Record token and model usage for an LLM call. */
  async usage(opts: UsageOpts, stepOpts?: StepOpts): Promise<void> {
    this._assertOpen();
    const event = buildTokenUsageEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      usage: opts,
      parent_id: this._currentParentId,
      tags: stepOpts?.tags ?? this._tags,
      custom_attributes: stepOpts?.custom_attributes,
      custom_headers: stepOpts?.custom_headers,
    });
    await this._submitEvent(event);
    await this._recordReceipt('usage', opts);
  }

  /** Record prompt/context composition at a decision point. */
  async contextWindow(opts: ContextWindowOpts, stepOpts?: StepOpts): Promise<void> {
    this._assertOpen();
    const event = buildContextWindowEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      context: opts,
      parent_id: this._currentParentId,
      tags: stepOpts?.tags ?? this._tags,
      custom_attributes: stepOpts?.custom_attributes,
      custom_headers: stepOpts?.custom_headers,
    });
    await this._submitEvent(event);
    await this._recordReceipt('context_window', opts);
  }

  /** Emit a signal from this run. Session and agent context are auto-filled. */
  async signal(body: CreateSignalBody): Promise<Signal> {
    this._assertOpen();
    return this._resources.signals.create({
      ...body,
      session_id: body.session_id ?? this.sessionId,
      agent_id: body.agent_id ?? this.agent,
    });
  }

  /** Record an inline evaluation check and emit a trace event + receipt. */
  async evaluate(name: string, input: Record<string, unknown>, result: { passed: boolean; score?: number; details?: string }, opts?: StepOpts): Promise<void> {
    this._assertOpen();
    const event = buildTraceEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      action_type: 'constraint_check',
      input: { evaluator: name, ...input },
      output: { passed: result.passed, score: result.score, details: result.details },
      parent_id: this._currentParentId,
      tags: opts?.tags ?? this._tags,
      custom_attributes: opts?.custom_attributes,
      custom_headers: opts?.custom_headers,
    });
    const submitted = await this._submitEvent(event);
    await this._recordReceipt(`eval:${name}`, input, { passed: result.passed, score: result.score });

    // Auto-emit signal on evaluation failure
    if (!result.passed) {
      const traceNodeId = submitted.nodes[0]?.id;
      await this._resources.signals.create({
        title: `Evaluation failed: ${name}`,
        message: result.details ?? `Evaluator "${name}" did not pass`,
        severity: 'medium',
        session_id: this.sessionId,
        agent_id: this.agent,
        trace_node_id: traceNodeId,
        metadata: { evaluator: name, score: result.score, trace_node_id: traceNodeId, ...input },
      });
    }
  }

  /** Flush any pending trace or receipt work without closing the run. */
  async flush(): Promise<void> {
    await this._flushPendingWork();
  }

  /** Mark the run as failed, emit an error event, and close the session. */
  async fail(error: unknown): Promise<RunSummary> {
    this._assertOpen();
    const errorMsg = error instanceof Error ? error.message : String(error);

    // Emit a final error trace event
    const event = buildTraceEvent({
      session_id: this.sessionId,
      agent_id: this.agent,
      action_type: 'trace_step',
      input: { step: '__run_failed' },
      error: errorMsg,
      parent_id: this._currentParentId,
      tags: this._tags,
    });
    await this._submitEvent(event);
    await this._recordReceipt('__run_failed', undefined, undefined, errorMsg);

    return this._close('failed');
  }

  /** Cancel the run with an optional reason and close the session. */
  async cancel(reason?: string): Promise<RunSummary> {
    this._assertOpen();

    if (reason) {
      const output = { reason };
      const event = buildTraceEvent({
        session_id: this.sessionId,
        agent_id: this.agent,
        action_type: 'trace_step',
        input: { step: '__run_cancelled' },
        output,
        parent_id: this._currentParentId,
        tags: this._tags,
      });
      await this._submitEvent(event);
      await this._recordReceipt('__run_cancelled', undefined, output);
    } else {
      await this._recordReceipt('__run_cancelled');
    }

    return this._close('cancelled');
  }

  /** Finish the run: close the session and return a summary. */
  async finish(status: RunStatus = 'closed'): Promise<RunSummary> {
    this._assertOpen();
    return this._close(status);
  }

  private async _close(status: RunStatus): Promise<RunSummary> {
    this._finished = true;

    let receiptCount = 0;
    if (this._provenanceSession) {
      receiptCount = this._provenanceSession.getReceipts().length;
      await this._provenanceSession.end(status === 'closed' ? 'closed' : 'tampered');
    } else {
      await this._resources.sessions.close(this.sessionId, status === 'closed' ? 'closed' : 'tampered', '0');
    }

    return {
      session_id: this.sessionId,
      duration_ms: Date.now() - this._startTime,
      event_count: this._eventCount,
      receipt_count: receiptCount,
      status,
    };
  }

  private _assertOpen(): void {
    if (this._finished) {
      throw new Error(`Run ${this.sessionId} is already finished`);
    }
  }
}
