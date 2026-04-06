/**
 * LangChain adapter — route LangChain traces through Invariance.
 * No LangChain install required; demonstrates the adapter API with mock calls.
 *
 * Run: npx tsx examples/langchain-tracing.ts
 */
import { Invariance } from '@invariance/sdk';
import { InvarianceLangChainTracer } from '@invariance/sdk/adapters/langchain';

const { privateKey } = Invariance.generateKeypair();

const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY || 'dev_test',
  privateKey,
  mode: 'DEV', // Full-fidelity tracing, no sampling
});

// Create the adapter — pass it as a LangChain callback handler
const tracer = new InvarianceLangChainTracer(inv.tracer, 'langchain-demo');

// Simulate LangChain lifecycle events:

// 1. LLM start — e.g., ChatOpenAI receives a prompt
tracer.handleLLMStart({ name: 'gpt-4' }, [
  'You are a research assistant. Summarize this article.',
]);

// 2. Tool invocation — e.g., agent calls a search tool
tracer.handleToolStart({ name: 'web_search' }, '{"query":"quantum computing 2026"}');

// 3. Another tool call
tracer.handleToolStart({ name: 'calculator' }, '{"expression":"2^128"}');

// 4. Error handling — adapter captures chain errors as decision points
try {
  throw new Error('Rate limit exceeded');
} catch (e) {
  tracer.handleChainError(e as Error);
}

await inv.shutdown();

console.log('Traces submitted. View them in the Invariance dashboard (DEV mode).');
