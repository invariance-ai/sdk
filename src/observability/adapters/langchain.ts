import { ulid } from 'ulid';
import type { InvarianceTracer } from '../tracer.js';

// ── LangChain type-only imports ──
// These mirror the shapes from @langchain/core/callbacks without requiring
// langchain at runtime.  All imports are `import type` so they are erased
// at compile time and the adapter works even when langchain is not installed.

/** Serialized representation of a langchain component. */
export interface SerializedLike {
  name?: string;
  id?: string[];
  [key: string]: unknown;
}

/** Minimal LLM result shape. */
export interface LLMResultLike {
  generations: { text?: string; generationInfo?: Record<string, unknown> }[][];
  llmOutput?: Record<string, unknown> | null;
}

/** Minimal chain values shape. */
export type ChainValuesLike = Record<string, unknown>;

/** Minimal agent action shape. */
export interface AgentActionLike {
  tool: string;
  toolInput: string | Record<string, unknown>;
  log: string;
}

/** Minimal agent finish shape. */
export interface AgentFinishLike {
  returnValues: Record<string, unknown>;
  log: string;
}

/** Minimal document shape for retriever callbacks. */
export interface DocumentLike {
  pageContent: string;
  metadata: Record<string, unknown>;
}

// ── Internal span tracking ──

interface SpanInfo {
  nodeId: string;
  parentRunId?: string;
  startTime: number;
  kind: 'llm' | 'tool' | 'chain' | 'retriever' | 'agent';
  name: string;
  metadata: Record<string, unknown>;
}

/**
 * LangChain callback handler adapter for Invariance observability.
 *
 * Implements all `BaseCallbackHandler` callbacks without requiring a runtime
 * import of langchain.  Pass an instance as a callback to any LangChain
 * runnable:
 *
 * @example
 * ```ts
 * import { InvarianceLangChainTracer } from '@invariance/sdk/adapters/langchain'
 * const tracer = new InvarianceLangChainTracer(invariance.tracer, 'session-123')
 * const chain = prompt.pipe(model)
 * await chain.invoke({ input: 'hello' }, { callbacks: [tracer] })
 * ```
 */
export class InvarianceLangChainTracer {
  /** Required by LangChain BaseCallbackHandler interface. */
  readonly name = 'InvarianceLangChainTracer';

  readonly sessionId: string;
  private readonly tracer: InvarianceTracer;

  /** runId -> SpanInfo for tracking parent-child relationships and timing. */
  private spans = new Map<string, SpanInfo>();

  /** runId -> parentRunId mapping for hierarchical span lookup. */
  private parentMap = new Map<string, string>();

  constructor(tracer: InvarianceTracer, sessionId: string) {
    this.tracer = tracer;
    this.sessionId = sessionId;
  }

  // ── Helpers ──

  private startSpan(
    runId: string,
    parentRunId: string | undefined,
    kind: SpanInfo['kind'],
    name: string,
    metadata?: Record<string, unknown>,
  ): SpanInfo {
    const span: SpanInfo = {
      nodeId: ulid(),
      parentRunId,
      startTime: Date.now(),
      kind,
      name,
      metadata: metadata ?? {},
    };
    this.spans.set(runId, span);
    if (parentRunId) {
      this.parentMap.set(runId, parentRunId);
    }
    return span;
  }

  private getSpan(runId: string): SpanInfo | undefined {
    return this.spans.get(runId);
  }

  private endSpan(runId: string): SpanInfo | undefined {
    const span = this.spans.get(runId);
    this.spans.delete(runId);
    this.parentMap.delete(runId);
    return span;
  }

  private depthOf(runId: string): number {
    let depth = 0;
    let current = runId;
    while (this.parentMap.has(current)) {
      depth++;
      current = this.parentMap.get(current)!;
    }
    return depth;
  }

  // ── LLM callbacks ──

  handleLLMStart(
    llm: SerializedLike,
    prompts: string[],
    runId: string,
    parentRunId?: string,
    _extraParams?: Record<string, unknown>,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _name?: string,
  ): void {
    const modelName = _name ?? llm.name ?? llm.id?.join('/') ?? 'unknown-llm';
    this.startSpan(runId, parentRunId, 'llm', modelName, {
      prompts,
      model: modelName,
    });

    this.tracer.emit('DecisionPoint', {
      nodeId: this.getSpan(runId)!.nodeId,
      candidates: prompts,
      chosen: prompts[0] ?? '',
      depth: this.depthOf(runId),
    });
  }

  handleLLMEnd(output: LLMResultLike, runId: string): void {
    const span = this.endSpan(runId);
    if (!span) return;

    const latencyMs = Date.now() - span.startTime;

    // Extract token usage from llmOutput
    const tokenUsage = this.extractTokenUsage(output);

    const generationText = output.generations
      .flat()
      .map((g) => g.text ?? '')
      .join('');

    this.tracer.emit('DecisionPoint', {
      nodeId: span.nodeId,
      candidates: [generationText],
      chosen: generationText,
      depth: span.metadata.depth as number ?? 0,
    });

    // Also emit as a tool invocation to capture latency and token cost
    if (tokenUsage.totalTokens > 0) {
      this.tracer.emit('ToolInvocation', {
        nodeId: ulid(),
        tool: `llm:${span.name}`,
        inputHash: String(tokenUsage.promptTokens),
        outputHash: String(tokenUsage.completionTokens),
        latencyMs,
      });
    }
  }

  handleLLMError(error: Error, runId: string): void {
    const span = this.endSpan(runId);
    this.tracer.emit('DecisionPoint', {
      nodeId: span?.nodeId ?? ulid(),
      candidates: [],
      chosen: `error: ${error.message}`,
      depth: 0,
    });
  }

  // ── Tool callbacks ──

  handleToolStart(
    tool: { name: string } | SerializedLike,
    input: string,
    runId: string,
    parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _name?: string,
  ): void {
    const toolName = _name ?? ('name' in tool ? tool.name : undefined) ?? 'unknown-tool';
    this.startSpan(runId, parentRunId, 'tool', toolName, {
      input,
    });

    this.tracer.emit('ToolInvocation', {
      nodeId: this.getSpan(runId)!.nodeId,
      tool: toolName,
      inputHash: input,
      outputHash: '',
      latencyMs: 0,
    });
  }

  handleToolEnd(output: string, runId: string): void {
    const span = this.endSpan(runId);
    if (!span) return;

    const latencyMs = Date.now() - span.startTime;

    this.tracer.emit('ToolInvocation', {
      nodeId: span.nodeId,
      tool: span.name,
      inputHash: (span.metadata.input as string) ?? '',
      outputHash: output,
      latencyMs,
    });
  }

  handleToolError(error: Error, runId: string): void {
    const span = this.endSpan(runId);
    this.tracer.emit('ToolInvocation', {
      nodeId: span?.nodeId ?? ulid(),
      tool: span?.name ?? 'unknown-tool',
      inputHash: '',
      outputHash: `error: ${error.message}`,
      latencyMs: 0,
    });
  }

  // ── Chain callbacks ──

  handleChainStart(
    chain: SerializedLike,
    inputs: ChainValuesLike,
    runId: string,
    parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _runType?: string,
    _name?: string,
  ): void {
    const chainName = _name ?? chain.name ?? chain.id?.join('/') ?? 'unknown-chain';
    this.startSpan(runId, parentRunId, 'chain', chainName, {
      inputs,
    });

    this.tracer.emit('DecisionPoint', {
      nodeId: this.getSpan(runId)!.nodeId,
      candidates: Object.keys(inputs),
      chosen: chainName,
      depth: this.depthOf(runId),
    });
  }

  handleChainEnd(outputs: ChainValuesLike, runId: string): void {
    const span = this.endSpan(runId);
    if (!span) return;

    this.tracer.emit('DecisionPoint', {
      nodeId: span.nodeId,
      candidates: Object.keys(outputs),
      chosen: span.name,
      depth: 0,
    });
  }

  handleChainError(error: Error, runId: string): void {
    const span = this.endSpan(runId);
    this.tracer.emit('DecisionPoint', {
      nodeId: span?.nodeId ?? ulid(),
      candidates: [],
      chosen: `error: ${error.message}`,
      depth: 0,
    });
  }

  // ── Retriever callbacks ──

  handleRetrieverStart(
    retriever: SerializedLike,
    query: string,
    runId: string,
    parentRunId?: string,
    _tags?: string[],
    _metadata?: Record<string, unknown>,
    _name?: string,
  ): void {
    const retrieverName = _name ?? retriever.name ?? 'unknown-retriever';
    this.startSpan(runId, parentRunId, 'retriever', retrieverName, {
      query,
    });

    this.tracer.emit('ToolInvocation', {
      nodeId: this.getSpan(runId)!.nodeId,
      tool: `retriever:${retrieverName}`,
      inputHash: query,
      outputHash: '',
      latencyMs: 0,
    });
  }

  handleRetrieverEnd(documents: DocumentLike[], runId: string): void {
    const span = this.endSpan(runId);
    if (!span) return;

    const latencyMs = Date.now() - span.startTime;

    this.tracer.emit('ToolInvocation', {
      nodeId: span.nodeId,
      tool: `retriever:${span.name}`,
      inputHash: (span.metadata.query as string) ?? '',
      outputHash: `${documents.length} documents`,
      latencyMs,
    });
  }

  handleRetrieverError(error: Error, runId: string): void {
    const span = this.endSpan(runId);
    this.tracer.emit('ToolInvocation', {
      nodeId: span?.nodeId ?? ulid(),
      tool: `retriever:${span?.name ?? 'unknown-retriever'}`,
      inputHash: '',
      outputHash: `error: ${error.message}`,
      latencyMs: 0,
    });
  }

  // ── Agent callbacks ──

  handleAgentAction(action: AgentActionLike, runId: string): void {
    const span = this.getSpan(runId);

    this.tracer.emit('ToolInvocation', {
      nodeId: span?.nodeId ?? ulid(),
      tool: action.tool,
      inputHash: typeof action.toolInput === 'string'
        ? action.toolInput
        : JSON.stringify(action.toolInput),
      outputHash: '',
      latencyMs: 0,
    });
  }

  handleAgentEnd(finish: AgentFinishLike, runId: string): void {
    const span = this.getSpan(runId);

    this.tracer.emit('DecisionPoint', {
      nodeId: span?.nodeId ?? ulid(),
      candidates: Object.keys(finish.returnValues),
      chosen: finish.log || 'agent-finish',
      depth: 0,
    });
  }

  // ── Token usage extraction ──

  private extractTokenUsage(output: LLMResultLike): {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } {
    const llmOutput = output.llmOutput;
    if (!llmOutput) {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    // OpenAI-style token usage
    const tokenUsage =
      (llmOutput.tokenUsage as Record<string, number> | undefined) ??
      (llmOutput.token_usage as Record<string, number> | undefined) ??
      (llmOutput.usage as Record<string, number> | undefined);

    if (!tokenUsage) {
      return { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    }

    const promptTokens =
      (tokenUsage.promptTokens ?? tokenUsage.prompt_tokens ?? 0) as number;
    const completionTokens =
      (tokenUsage.completionTokens ?? tokenUsage.completion_tokens ?? 0) as number;
    const totalTokens =
      (tokenUsage.totalTokens ?? tokenUsage.total_tokens ?? promptTokens + completionTokens) as number;

    return { promptTokens, completionTokens, totalTokens };
  }
}
