import { ulid } from 'ulid';
import type { InvarianceTracer } from '../tracer.js';

// ── Locally-defined CrewAI callback shapes (no runtime import) ──

/** Describes a CrewAI crew for lifecycle callbacks. */
export interface CrewInfo {
  name: string;
  agents: string[];
  tasks: string[];
}

/** Describes a CrewAI task for lifecycle callbacks. */
export interface TaskInfo {
  name: string;
  description?: string;
  agentId: string;
  expectedOutput?: string;
}

/** Describes an agent action within a task. */
export interface AgentActionInfo {
  agentId: string;
  action: string;
  tool?: string;
  toolInput?: unknown;
}

/** Describes an agent thinking/reasoning step. */
export interface AgentThinkingInfo {
  agentId: string;
  thought: string;
}

/** Describes a delegation from one agent to another. */
export interface DelegationInfo {
  fromAgentId: string;
  toAgentId: string;
  taskName: string;
  reason?: string;
}

// ── Internal span tracking ──

interface SpanEntry {
  spanId: string;
  parentSpanId?: string;
  type: 'crew' | 'task' | 'action';
  name: string;
  agentId?: string;
  startTime: number;
}

/**
 * CrewAI middleware adapter for Invariance observability.
 *
 * Tracks the full CrewAI lifecycle: crew start/end, task start/complete/error,
 * agent actions, agent thinking, and delegation chains.
 *
 * Maintains nested span tracking (crew -> task -> action) and delegation chains.
 *
 * @example
 * ```ts
 * import { InvarianceCrewAIMiddleware } from '@invariance/sdk/adapters/crewai'
 * const middleware = new InvarianceCrewAIMiddleware(invariance.tracer, 'session-123')
 *
 * middleware.onCrewStart({ name: 'my-crew', agents: ['researcher', 'writer'], tasks: ['research', 'write'] })
 * middleware.onTaskStart({ name: 'research', agentId: 'researcher' })
 * middleware.onAgentAction({ agentId: 'researcher', action: 'search', tool: 'web_search', toolInput: { q: 'AI' } })
 * middleware.onAgentThinking({ agentId: 'researcher', thought: 'I need to find recent papers' })
 * middleware.onTaskComplete('research', 'researcher', { result: 'Found 5 papers' })
 * middleware.onCrewEnd('my-crew', { finalOutput: 'Report generated' })
 * ```
 */
export class InvarianceCrewAIMiddleware {
  readonly sessionId: string;
  private readonly tracer: InvarianceTracer;
  private readonly now: () => number;

  /** Active spans keyed by spanId */
  private activeSpans = new Map<string, SpanEntry>();

  /** Current crew-level span id (top-level container) */
  private crewSpanId: string | undefined;

  /** Current task-level span ids keyed by taskName */
  private taskSpans = new Map<string, string>();

  /** Delegation chains: list of delegation edges */
  private delegationChains: DelegationInfo[] = [];

  /** Depth tracker: crew=0, task=1, action=2 */
  private static readonly DEPTH_CREW = 0;
  private static readonly DEPTH_TASK = 1;
  private static readonly DEPTH_ACTION = 2;

  constructor(tracer: InvarianceTracer, sessionId: string, now?: () => number) {
    this.tracer = tracer;
    this.sessionId = sessionId;
    this.now = now ?? Date.now;
  }

  // ── Crew lifecycle ──

  /** Called when a CrewAI crew begins execution. Creates the top-level crew span. */
  onCrewStart(crew: CrewInfo): string {
    const spanId = ulid();
    this.crewSpanId = spanId;

    this.activeSpans.set(spanId, {
      spanId,
      type: 'crew',
      name: crew.name,
      startTime: this.now(),
    });

    // Emit a DecisionPoint for crew start
    this.tracer.emit('DecisionPoint', {
      nodeId: spanId,
      candidates: crew.tasks,
      chosen: crew.name,
      depth: InvarianceCrewAIMiddleware.DEPTH_CREW,
    });

    // Emit SubAgentSpawn for each agent in the crew
    for (const agentId of crew.agents) {
      this.tracer.emit('SubAgentSpawn', {
        parentNodeId: spanId,
        childAgentId: agentId,
        depth: InvarianceCrewAIMiddleware.DEPTH_CREW,
      });
    }

    return spanId;
  }

  /** Called when a CrewAI crew finishes execution. Closes the crew span. */
  onCrewEnd(crewName: string, _output?: unknown): void {
    const spanId = this.crewSpanId;
    if (!spanId) return;

    this.tracer.emit('DecisionPoint', {
      nodeId: ulid(),
      candidates: [crewName],
      chosen: `completed: ${crewName}`,
      depth: InvarianceCrewAIMiddleware.DEPTH_CREW,
    });

    this.activeSpans.delete(spanId);
    this.crewSpanId = undefined;
    // Clear all nested spans and delegation state on crew end.
    this.activeSpans.clear();
    this.taskSpans.clear();
    this.delegationChains = [];
  }

  // ── Task lifecycle ──

  /** Called when a task begins. Creates a task-level span nested under the crew span. */
  onTaskStart(task: TaskInfo): string {
    const spanId = ulid();

    this.taskSpans.set(task.name, spanId);

    this.activeSpans.set(spanId, {
      spanId,
      parentSpanId: this.crewSpanId,
      type: 'task',
      name: task.name,
      agentId: task.agentId,
      startTime: this.now(),
    });

    this.tracer.emit('SubAgentSpawn', {
      parentNodeId: this.crewSpanId ?? spanId,
      childAgentId: task.agentId,
      depth: InvarianceCrewAIMiddleware.DEPTH_TASK,
    });

    return spanId;
  }

  /** Called when a task completes successfully. Closes the task span. */
  onTaskComplete(taskName: string, _agentId: string, _output: unknown): void {
    const spanId = this.taskSpans.get(taskName);

    this.tracer.emit('DecisionPoint', {
      nodeId: spanId ?? ulid(),
      candidates: [taskName],
      chosen: taskName,
      depth: InvarianceCrewAIMiddleware.DEPTH_TASK,
    });

    if (spanId) {
      this.clearActionSpans(spanId);
      this.activeSpans.delete(spanId);
      this.taskSpans.delete(taskName);
    }
  }

  /** Called when a task fails. Emits error event and closes the task span. */
  onTaskError(taskName: string, _agentId: string, error: Error): void {
    const spanId = this.taskSpans.get(taskName);

    this.tracer.emit('DecisionPoint', {
      nodeId: spanId ?? ulid(),
      candidates: [taskName],
      chosen: `error: ${error.message}`,
      depth: InvarianceCrewAIMiddleware.DEPTH_TASK,
    });

    if (spanId) {
      this.clearActionSpans(spanId);
      this.activeSpans.delete(spanId);
      this.taskSpans.delete(taskName);
    }
  }

  // ── Agent action tracking ──

  /** Called when an agent performs an action (tool call, etc.) within a task. */
  onAgentAction(action: AgentActionInfo): string {
    const actionSpanId = ulid();

    // Find parent task span for this agent
    const parentTaskSpanId = this.findTaskSpanForAgent(action.agentId);

    this.activeSpans.set(actionSpanId, {
      spanId: actionSpanId,
      parentSpanId: parentTaskSpanId,
      type: 'action',
      name: action.action,
      agentId: action.agentId,
      startTime: this.now(),
    });

    if (action.tool) {
      this.tracer.emit('ToolInvocation', {
        nodeId: actionSpanId,
        tool: action.tool,
        inputHash: typeof action.toolInput === 'string'
          ? action.toolInput
          : JSON.stringify(action.toolInput ?? ''),
        outputHash: '',
        latencyMs: 0,
      });
    } else {
      this.tracer.emit('DecisionPoint', {
        nodeId: actionSpanId,
        candidates: [action.action],
        chosen: action.action,
        depth: InvarianceCrewAIMiddleware.DEPTH_ACTION,
      });
    }

    return actionSpanId;
  }

  // ── Agent thinking ──

  /** Called when an agent produces a thinking/reasoning step. */
  onAgentThinking(thinking: AgentThinkingInfo): void {
    const nodeId = ulid();

    this.tracer.emit('DecisionPoint', {
      nodeId,
      candidates: [thinking.thought],
      chosen: thinking.thought,
      depth: InvarianceCrewAIMiddleware.DEPTH_ACTION,
    });
  }

  // ── Delegation ──

  /** Called when one agent delegates a task to another agent. */
  onDelegation(delegation: DelegationInfo): void {
    this.delegationChains.push(delegation);

    const parentNodeId =
      this.findTaskSpanForAgent(delegation.fromAgentId) ??
      this.crewSpanId ??
      ulid();

    // Emit SubAgentSpawn to represent the delegation
    this.tracer.emit('SubAgentSpawn', {
      parentNodeId,
      childAgentId: delegation.toAgentId,
      depth: InvarianceCrewAIMiddleware.DEPTH_TASK,
    });

    // Emit a DecisionPoint capturing the delegation decision
    this.tracer.emit('DecisionPoint', {
      nodeId: ulid(),
      candidates: [delegation.fromAgentId, delegation.toAgentId],
      chosen: `delegate: ${delegation.fromAgentId} -> ${delegation.toAgentId}`,
      depth: InvarianceCrewAIMiddleware.DEPTH_TASK,
    });
  }

  // ── Accessors ──

  /** Returns the current delegation chain. */
  getDelegationChains(): readonly DelegationInfo[] {
    return this.delegationChains;
  }

  /** Returns all currently active spans. */
  getActiveSpans(): ReadonlyMap<string, SpanEntry> {
    return this.activeSpans;
  }

  /** Returns the current crew span ID, if a crew is active. */
  getCrewSpanId(): string | undefined {
    return this.crewSpanId;
  }

  // ── Internal helpers ──

  private findTaskSpanForAgent(agentId: string): string | undefined {
    for (const [, span] of this.activeSpans) {
      if (span.type === 'task' && span.agentId === agentId) {
        return span.spanId;
      }
    }
    return undefined;
  }

  private clearActionSpans(parentSpanId: string): void {
    for (const [spanId, span] of this.activeSpans) {
      if (span.type === 'action' && span.parentSpanId === parentSpanId) {
        this.activeSpans.delete(spanId);
      }
    }
  }
}
