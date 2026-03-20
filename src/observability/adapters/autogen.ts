import { ulid } from 'ulid';
import type { InvarianceTracer } from '../tracer.js';

// ── Local AutoGen interfaces (no runtime import) ──

/** Represents a message in an AutoGen conversation. */
export interface AutoGenMessage {
  sender: string;
  receiver: string;
  content: string;
  timestamp?: number;
}

/** Represents a tool call made by an AutoGen agent. */
export interface AutoGenToolCall {
  agentId: string;
  toolName: string;
  args: unknown;
  callId?: string;
}

/** Represents the result of a tool call. */
export interface AutoGenToolResult {
  agentId: string;
  toolName: string;
  result: unknown;
  callId?: string;
  durationMs?: number;
}

/** Represents an agent's response in a conversation. */
export interface AutoGenAgentResponse {
  agentId: string;
  content: string;
  replyTo?: string;
  metadata?: Record<string, unknown>;
}

/** Represents a function call (distinct from tool calls in AutoGen). */
export interface AutoGenFunctionCall {
  agentId: string;
  functionName: string;
  args: unknown;
  result?: unknown;
}

/** Tracks group chat membership and state. */
export interface GroupChatState {
  chatId: string;
  agents: string[];
  messageCount: number;
  startedAt: number;
  spanId: string;
}

// ── Schema version embedded in all events ──

const SCHEMA_VERSION = '1.0.0';

/**
 * AutoGen middleware adapter for Invariance observability.
 *
 * Provides full lifecycle tracking for AutoGen multi-agent conversations
 * including message passing, tool calls, group chats, agent responses,
 * and function calls.
 *
 * @example
 * ```ts
 * import { InvarianceAutoGenMiddleware } from '@invariance/sdk/adapters/autogen'
 * const middleware = new InvarianceAutoGenMiddleware(invariance.tracer, 'session-123')
 *
 * // Message passing
 * middleware.onMessage('agent-a', 'agent-b', 'Hello')
 *
 * // Group chat lifecycle
 * middleware.onGroupChatStart(['agent-a', 'agent-b', 'agent-c'])
 * middleware.onGroupChatMessage('chat-1', 'agent-a', 'Let us discuss')
 * middleware.onGroupChatEnd('chat-1')
 * ```
 */
export class InvarianceAutoGenMiddleware {
  readonly sessionId: string;
  private readonly tracer: InvarianceTracer;
  private readonly groupChats = new Map<string, GroupChatState>();

  constructor(tracer: InvarianceTracer, sessionId: string) {
    this.tracer = tracer;
    this.sessionId = sessionId;
  }

  /**
   * Track a message passed between two agents.
   */
  onMessage(sender: string, receiver: string, content: string): void {
    this.tracer.emit('DecisionPoint', {
      nodeId: ulid(),
      candidates: [receiver],
      chosen: sender,
      depth: 0,
      schemaVersion: SCHEMA_VERSION,
      eventType: 'message',
      sender,
      receiver,
      content,
    } as any);
  }

  /**
   * Track a tool invocation by an agent.
   */
  onToolCall(agentId: string, toolName: string, args: unknown): string {
    const callId = ulid();
    this.tracer.emit('ToolInvocation', {
      nodeId: callId,
      tool: toolName,
      inputHash: typeof args === 'string' ? args : JSON.stringify(args),
      outputHash: '',
      latencyMs: 0,
      schemaVersion: SCHEMA_VERSION,
      eventType: 'tool_call',
      agentId,
      args,
    } as any);
    return callId;
  }

  /**
   * Track a tool result returned to an agent.
   */
  onToolResult(agentId: string, toolName: string, result: unknown, callId?: string, durationMs?: number): void {
    this.tracer.emit('ToolInvocation', {
      nodeId: callId ?? ulid(),
      tool: toolName,
      inputHash: '',
      outputHash: typeof result === 'string' ? result : JSON.stringify(result),
      latencyMs: durationMs ?? 0,
      schemaVersion: SCHEMA_VERSION,
      eventType: 'tool_result',
      agentId,
      result,
    } as any);
  }

  /**
   * Start tracking a group chat session. Returns a chat ID for subsequent events.
   */
  onGroupChatStart(agents: string[]): string {
    const chatId = ulid();
    const spanId = ulid();
    const state: GroupChatState = {
      chatId,
      agents: [...agents],
      messageCount: 0,
      startedAt: Date.now(),
      spanId,
    };
    this.groupChats.set(chatId, state);

    // Emit spawn events for each agent in the group chat
    for (const agentId of agents) {
      this.tracer.emit('SubAgentSpawn', {
        parentNodeId: spanId,
        childAgentId: agentId,
        depth: 0,
        schemaVersion: SCHEMA_VERSION,
        eventType: 'group_chat_start',
        chatId,
        agents,
      } as any);
    }

    return chatId;
  }

  /**
   * Track a message within a group chat.
   */
  onGroupChatMessage(chatId: string, sender: string, content: string): void {
    const state = this.groupChats.get(chatId);
    if (state) {
      state.messageCount++;
    }

    this.tracer.emit('DecisionPoint', {
      nodeId: ulid(),
      candidates: state?.agents ?? [sender],
      chosen: sender,
      depth: state ? 1 : 0,
      schemaVersion: SCHEMA_VERSION,
      eventType: 'group_chat_message',
      chatId,
      sender,
      content,
      messageIndex: state?.messageCount ?? 0,
    } as any);
  }

  /**
   * End a group chat session. Emits a final summary event.
   */
  onGroupChatEnd(chatId: string): GroupChatState | undefined {
    const state = this.groupChats.get(chatId);
    if (!state) return undefined;

    this.tracer.emit('DecisionPoint', {
      nodeId: ulid(),
      candidates: state.agents,
      chosen: `group_chat_end:${chatId}`,
      depth: 0,
      schemaVersion: SCHEMA_VERSION,
      eventType: 'group_chat_end',
      chatId,
      agents: state.agents,
      messageCount: state.messageCount,
      durationMs: Date.now() - state.startedAt,
    } as any);

    this.groupChats.delete(chatId);
    return state;
  }

  /**
   * Track an agent's response in the conversation.
   */
  onAgentResponse(agentId: string, content: string, replyTo?: string): void {
    this.tracer.emit('DecisionPoint', {
      nodeId: ulid(),
      candidates: replyTo ? [replyTo] : [],
      chosen: content,
      depth: 0,
      schemaVersion: SCHEMA_VERSION,
      eventType: 'agent_response',
      agentId,
      replyTo,
    } as any);
  }

  /**
   * Track a function call made by an agent.
   */
  onFunctionCall(agentId: string, functionName: string, args: unknown, result?: unknown): void {
    this.tracer.emit('ToolInvocation', {
      nodeId: ulid(),
      tool: functionName,
      inputHash: typeof args === 'string' ? args : JSON.stringify(args),
      outputHash: result !== undefined ? (typeof result === 'string' ? result : JSON.stringify(result)) : '',
      latencyMs: 0,
      schemaVersion: SCHEMA_VERSION,
      eventType: 'function_call',
      agentId,
      args,
      result,
    } as any);
  }

  /**
   * Get the current state of a group chat.
   */
  getGroupChatState(chatId: string): GroupChatState | undefined {
    const state = this.groupChats.get(chatId);
    return state ? { ...state, agents: [...state.agents] } : undefined;
  }

  /**
   * Get all active group chat IDs.
   */
  getActiveGroupChats(): string[] {
    return [...this.groupChats.keys()];
  }
}
