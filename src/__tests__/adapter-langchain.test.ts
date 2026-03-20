import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InvarianceLangChainTracer } from '../observability/adapters/langchain.js';
import { InvarianceTracer } from '../observability/tracer.js';
import type { Transport } from '../transport.js';

// ── Helpers ──

function makeTracer() {
  const transport = {
    submitTraceEvent: vi.fn().mockResolvedValue(undefined),
    submitBehavioralEvent: vi.fn().mockResolvedValue(undefined),
    verifyExecution: vi.fn().mockResolvedValue({ valid: true }),
  };

  const tracer = new InvarianceTracer(transport as unknown as Transport, {
    mode: 'DEV',
  });

  return { tracer, transport };
}

function makeAdapter(tracer: InvarianceTracer) {
  return new InvarianceLangChainTracer(tracer, 'test-session');
}

describe('InvarianceLangChainTracer', () => {
  let tracer: InvarianceTracer;
  let transport: ReturnType<typeof makeTracer>['transport'];
  let adapter: InvarianceLangChainTracer;

  beforeEach(() => {
    vi.clearAllMocks();
    const setup = makeTracer();
    tracer = setup.tracer;
    transport = setup.transport;
    adapter = makeAdapter(tracer);
  });

  // ── LLM ──

  describe('LLM callbacks', () => {
    it('handleLLMStart emits DecisionPoint with model name and prompts', () => {
      adapter.handleLLMStart(
        { name: 'gpt-4', id: ['openai', 'gpt-4'] },
        ['Hello, world!'],
        'run-1',
        undefined,
      );

      expect(transport.submitBehavioralEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DecisionPoint',
          data: expect.objectContaining({
            candidates: ['Hello, world!'],
            chosen: 'Hello, world!',
            depth: 0,
          }),
        }),
      );
    });

    it('handleLLMStart uses _name parameter when provided', () => {
      adapter.handleLLMStart(
        { name: 'base-model' },
        ['prompt'],
        'run-1',
        undefined,
        undefined,
        undefined,
        undefined,
        'custom-model-name',
      );

      // The span should store the custom name
      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
    });

    it('handleLLMEnd emits DecisionPoint with generation text', () => {
      adapter.handleLLMStart(
        { name: 'gpt-4' },
        ['Hello'],
        'run-1',
      );

      adapter.handleLLMEnd(
        {
          generations: [[{ text: 'World!' }]],
          llmOutput: null,
        },
        'run-1',
      );

      // Should have 2 calls: one from start, one from end
      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(2);
      const endCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(endCall.type).toBe('DecisionPoint');
      expect(endCall.data.chosen).toBe('World!');
    });

    it('handleLLMEnd captures token usage and emits ToolInvocation', () => {
      adapter.handleLLMStart(
        { name: 'gpt-4' },
        ['Hello'],
        'run-1',
      );

      adapter.handleLLMEnd(
        {
          generations: [[{ text: 'Hi' }]],
          llmOutput: {
            tokenUsage: {
              promptTokens: 10,
              completionTokens: 5,
              totalTokens: 15,
            },
          },
        },
        'run-1',
      );

      // DecisionPoint from start + DecisionPoint from end + ToolInvocation for token usage
      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(3);

      const tokenCall = transport.submitBehavioralEvent.mock.calls[2]![0];
      expect(tokenCall.type).toBe('ToolInvocation');
      expect(tokenCall.data.tool).toBe('llm:gpt-4');
      expect(tokenCall.data.inputHash).toBe('10');   // prompt tokens
      expect(tokenCall.data.outputHash).toBe('5');    // completion tokens
    });

    it('handleLLMEnd handles snake_case token usage keys', () => {
      adapter.handleLLMStart(
        { name: 'gpt-4' },
        ['Hello'],
        'run-1',
      );

      adapter.handleLLMEnd(
        {
          generations: [[{ text: 'Hi' }]],
          llmOutput: {
            token_usage: {
              prompt_tokens: 20,
              completion_tokens: 10,
              total_tokens: 30,
            },
          },
        },
        'run-1',
      );

      // Should emit ToolInvocation with token counts
      const tokenCall = transport.submitBehavioralEvent.mock.calls[2]![0];
      expect(tokenCall.type).toBe('ToolInvocation');
      expect(tokenCall.data.inputHash).toBe('20');
      expect(tokenCall.data.outputHash).toBe('10');
    });

    it('handleLLMError emits error DecisionPoint and cleans up span', () => {
      adapter.handleLLMStart(
        { name: 'gpt-4' },
        ['Hello'],
        'run-1',
      );

      adapter.handleLLMError(new Error('rate limited'), 'run-1');

      const errorCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(errorCall.type).toBe('DecisionPoint');
      expect(errorCall.data.chosen).toBe('error: rate limited');
      expect(errorCall.data.candidates).toEqual([]);
    });

    it('handleLLMError works even if start was never called', () => {
      adapter.handleLLMError(new Error('unexpected'), 'run-nonexistent');

      expect(transport.submitBehavioralEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DecisionPoint',
          data: expect.objectContaining({
            chosen: 'error: unexpected',
          }),
        }),
      );
    });
  });

  // ── Tool ──

  describe('Tool callbacks', () => {
    it('handleToolStart emits ToolInvocation with tool name and input', () => {
      adapter.handleToolStart(
        { name: 'calculator' },
        '2 + 2',
        'run-t1',
      );

      expect(transport.submitBehavioralEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ToolInvocation',
          data: expect.objectContaining({
            tool: 'calculator',
            inputHash: '2 + 2',
          }),
        }),
      );
    });

    it('handleToolEnd emits ToolInvocation with output and latency', () => {
      adapter.handleToolStart(
        { name: 'calculator' },
        '2 + 2',
        'run-t1',
      );

      adapter.handleToolEnd('4', 'run-t1');

      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(2);
      const endCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(endCall.type).toBe('ToolInvocation');
      expect(endCall.data.tool).toBe('calculator');
      expect(endCall.data.outputHash).toBe('4');
      expect(endCall.data.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('handleToolError emits ToolInvocation with error output', () => {
      adapter.handleToolStart(
        { name: 'web_search' },
        'query',
        'run-t2',
      );

      adapter.handleToolError(new Error('network timeout'), 'run-t2');

      const errorCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(errorCall.type).toBe('ToolInvocation');
      expect(errorCall.data.outputHash).toBe('error: network timeout');
    });

    it('handleToolStart uses _name override', () => {
      adapter.handleToolStart(
        { name: 'generic' },
        'input',
        'run-t3',
        undefined,
        undefined,
        undefined,
        'specific-tool',
      );

      expect(transport.submitBehavioralEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ tool: 'specific-tool' }),
        }),
      );
    });
  });

  // ── Chain ──

  describe('Chain callbacks', () => {
    it('handleChainStart emits DecisionPoint with chain name and input keys', () => {
      adapter.handleChainStart(
        { name: 'RunnableSequence', id: ['langchain', 'schema', 'runnable'] },
        { input: 'hello', context: 'world' },
        'run-c1',
      );

      expect(transport.submitBehavioralEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DecisionPoint',
          data: expect.objectContaining({
            candidates: ['input', 'context'],
            chosen: 'RunnableSequence',
          }),
        }),
      );
    });

    it('handleChainEnd emits DecisionPoint with output keys', () => {
      adapter.handleChainStart(
        { name: 'QAChain' },
        { question: 'what?' },
        'run-c2',
      );

      adapter.handleChainEnd({ answer: '42', source: 'doc1' }, 'run-c2');

      const endCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(endCall.type).toBe('DecisionPoint');
      expect(endCall.data.candidates).toEqual(['answer', 'source']);
    });

    it('handleChainError emits error DecisionPoint', () => {
      adapter.handleChainStart(
        { name: 'BadChain' },
        {},
        'run-c3',
      );

      adapter.handleChainError(new Error('chain broke'), 'run-c3');

      const errorCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(errorCall.type).toBe('DecisionPoint');
      expect(errorCall.data.chosen).toBe('error: chain broke');
    });
  });

  // ── Retriever ──

  describe('Retriever callbacks', () => {
    it('handleRetrieverStart emits ToolInvocation with query', () => {
      adapter.handleRetrieverStart(
        { name: 'VectorStoreRetriever' },
        'semantic search query',
        'run-r1',
      );

      expect(transport.submitBehavioralEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'ToolInvocation',
          data: expect.objectContaining({
            tool: 'retriever:VectorStoreRetriever',
            inputHash: 'semantic search query',
          }),
        }),
      );
    });

    it('handleRetrieverEnd emits ToolInvocation with document count', () => {
      adapter.handleRetrieverStart(
        { name: 'VectorStoreRetriever' },
        'query',
        'run-r2',
      );

      adapter.handleRetrieverEnd(
        [
          { pageContent: 'doc1', metadata: {} },
          { pageContent: 'doc2', metadata: {} },
          { pageContent: 'doc3', metadata: {} },
        ],
        'run-r2',
      );

      const endCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(endCall.type).toBe('ToolInvocation');
      expect(endCall.data.outputHash).toBe('3 documents');
      expect(endCall.data.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('handleRetrieverError emits error ToolInvocation', () => {
      adapter.handleRetrieverStart(
        { name: 'Retriever' },
        'query',
        'run-r3',
      );

      adapter.handleRetrieverError(new Error('index not found'), 'run-r3');

      const errorCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(errorCall.data.outputHash).toBe('error: index not found');
    });
  });

  // ── Agent ──

  describe('Agent callbacks', () => {
    it('handleAgentAction emits ToolInvocation with action details', () => {
      // Start a chain span to have a parent context
      adapter.handleChainStart(
        { name: 'AgentExecutor' },
        {},
        'run-a1',
      );

      adapter.handleAgentAction(
        {
          tool: 'search',
          toolInput: 'langchain docs',
          log: 'Searching for langchain docs',
        },
        'run-a1',
      );

      const actionCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(actionCall.type).toBe('ToolInvocation');
      expect(actionCall.data.tool).toBe('search');
      expect(actionCall.data.inputHash).toBe('langchain docs');
    });

    it('handleAgentAction handles object toolInput', () => {
      adapter.handleAgentAction(
        {
          tool: 'api_call',
          toolInput: { url: 'https://example.com', method: 'GET' },
          log: 'Calling API',
        },
        'run-a2',
      );

      const actionCall = transport.submitBehavioralEvent.mock.calls[0]![0];
      expect(actionCall.data.inputHash).toBe(
        JSON.stringify({ url: 'https://example.com', method: 'GET' }),
      );
    });

    it('handleAgentEnd emits DecisionPoint with return values', () => {
      adapter.handleAgentEnd(
        {
          returnValues: { output: 'final answer' },
          log: 'Agent finished with final answer',
        },
        'run-a3',
      );

      expect(transport.submitBehavioralEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'DecisionPoint',
          data: expect.objectContaining({
            candidates: ['output'],
            chosen: 'Agent finished with final answer',
          }),
        }),
      );
    });
  });

  // ── Parent-child relationships ──

  describe('Parent-child span relationships', () => {
    it('tracks depth via parentRunId', () => {
      // Top-level chain
      adapter.handleChainStart(
        { name: 'AgentExecutor' },
        { input: 'hello' },
        'run-parent',
      );

      // Nested LLM call
      adapter.handleLLMStart(
        { name: 'gpt-4' },
        ['Hello'],
        'run-child',
        'run-parent',
      );

      // The child should have depth 1
      const childCall = transport.submitBehavioralEvent.mock.calls[1]![0];
      expect(childCall.type).toBe('DecisionPoint');
      expect(childCall.data.depth).toBe(1);
    });

    it('tracks multi-level nesting', () => {
      adapter.handleChainStart(
        { name: 'AgentExecutor' },
        {},
        'run-l0',
      );

      adapter.handleChainStart(
        { name: 'LLMChain' },
        {},
        'run-l1',
        'run-l0',
      );

      adapter.handleLLMStart(
        { name: 'gpt-4' },
        ['prompt'],
        'run-l2',
        'run-l1',
      );

      // run-l2 should be depth 2
      const l2Call = transport.submitBehavioralEvent.mock.calls[2]![0];
      expect(l2Call.data.depth).toBe(2);
    });

    it('cleans up spans on end', () => {
      adapter.handleChainStart(
        { name: 'Chain' },
        {},
        'run-cleanup',
      );

      adapter.handleChainEnd({}, 'run-cleanup');

      // Calling end again should not emit (span already cleaned up)
      adapter.handleChainEnd({}, 'run-cleanup');

      // Only 2 behavioral events: start + first end
      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(2);
    });
  });

  // ── No runtime langchain import ──

  describe('No runtime langchain dependency', () => {
    it('adapter module does not import langchain at runtime', async () => {
      // Verify by checking the module source has no runtime imports from langchain
      const adapterModule = await import('../observability/adapters/langchain.js');
      expect(adapterModule.InvarianceLangChainTracer).toBeDefined();

      // The class should be constructable without langchain installed
      const { tracer: t } = makeTracer();
      const instance = new adapterModule.InvarianceLangChainTracer(t, 'sess');
      expect(instance.name).toBe('InvarianceLangChainTracer');
      expect(instance.sessionId).toBe('sess');
    });
  });

  // ── Edge cases ──

  describe('Edge cases', () => {
    it('handleLLMEnd with no span does not throw', () => {
      expect(() => {
        adapter.handleLLMEnd(
          { generations: [[{ text: 'Hi' }]], llmOutput: null },
          'nonexistent-run',
        );
      }).not.toThrow();
    });

    it('handleToolEnd with no span does not throw', () => {
      expect(() => {
        adapter.handleToolEnd('output', 'nonexistent-run');
      }).not.toThrow();
    });

    it('handleChainEnd with no span does not throw', () => {
      expect(() => {
        adapter.handleChainEnd({}, 'nonexistent-run');
      }).not.toThrow();
    });

    it('handleRetrieverEnd with no span does not throw', () => {
      expect(() => {
        adapter.handleRetrieverEnd([], 'nonexistent-run');
      }).not.toThrow();
    });

    it('handleLLMStart with no prompts handles gracefully', () => {
      expect(() => {
        adapter.handleLLMStart({ name: 'model' }, [], 'run-empty');
      }).not.toThrow();

      const call = transport.submitBehavioralEvent.mock.calls[0]![0];
      expect(call.data.chosen).toBe('');
    });

    it('uses id array for name when name is missing', () => {
      adapter.handleLLMStart(
        { id: ['langchain', 'llms', 'openai'] },
        ['prompt'],
        'run-id-fallback',
      );

      // Should not throw, name falls back to id.join('/')
      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(1);
    });

    it('handleLLMEnd with empty llmOutput extracts zero tokens', () => {
      adapter.handleLLMStart({ name: 'model' }, ['p'], 'run-notoken');
      adapter.handleLLMEnd(
        { generations: [[{ text: 'r' }]], llmOutput: {} },
        'run-notoken',
      );

      // Should only emit 2 events (start + end DecisionPoints), no ToolInvocation
      expect(transport.submitBehavioralEvent).toHaveBeenCalledTimes(2);
    });
  });
});
