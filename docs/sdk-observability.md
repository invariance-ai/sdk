# Invariance SDK — Observability API

## Overview

The SDK exposes the observability module from `invariance-core` as the public surface developers install. All changes are additive — existing signing primitives, hash chain logic, and public API surface are unchanged.

---

## Implementation Status

### Implemented (`src/observability/`)

| File | What it does | Status |
|---|---|---|
| `types.ts` | TracerConfig, TraceEvent, TraceMetadata, BehavioralPrimitive (DecisionPoint, ToolInvocation, SubAgentSpawn, GoalDrift), payload types for each primitive, VerificationProof, TraceAction | Done |
| `tracer.ts` | `InvarianceTracer` — DEV/PROD mode, two-tier sampling, span-based hot paths, hash chaining via `sortedStringify()+sha256()`, DEV tree tracking + console print, emit() for behavioral primitives | Done |
| `adapters/langchain.ts` | `InvarianceLangChainTracer` — handleLLMStart, handleToolStart, handleChainError | Done |
| `adapters/crewai.ts` | `InvarianceCrewAIMiddleware` — onTaskStart, onTaskComplete, onTaskError | Done |
| `adapters/autogen.ts` | `InvarianceAutoGenMiddleware` — onMessage, onToolCall, onGroupChatStart | Done |
| `index.ts` | Barrel export for all observability types and classes | Done |

### Changes to Existing SDK Files

| File | Changes | Status |
|---|---|---|
| `client.ts` | Added `tracer` property, `trace()`, `emit()`, `verify()`, `queryGraph()` methods to `Invariance` class | Done |
| `types.ts` | Added `mode`, `sampleRate`, `anomalyThreshold`, `onAnomaly`, `devOutput` to `InvarianceConfig` | Done |
| `transport.ts` | Added `submitTraceEvent()`, `submitBehavioralEvent()`, `verifyExecution()`, `queryGraph()` methods | Done |
| `package.json` | Added sub-path exports for `./adapters/langchain`, `./adapters/crewai`, `./adapters/autogen` | Done |
| `tsup.config.ts` | Added adapter entry points to build config | Done |
| `index.ts` | Re-exports all observability types | Done |

### Tests

All 51 existing tests pass. No new SDK-specific observability tests yet (the core module in `invariance-core` has 12 tests covering the underlying logic).

### Not Yet Implemented

- **DEV mode local UI server** — `devOutput: 'ui'` is accepted in config but only `'console'` output is implemented via `printDevTree()`
- **Backend API routes** — transport methods call `/v1/trace/*` endpoints that don't exist in `invariance-core` yet
- **Real verification proof** — `verify()` calls the backend but the backend route + Merkle proof logic isn't built
- **Graph query language** — `queryGraph()` accepts a string (Cypher-style) but no query parser exists on the backend

---

## 1. Initialization (implemented)

```typescript
import { Invariance } from '@invariance/sdk'

const invariance = Invariance.init({
  apiKey: 'inv_...',
  privateKey: '...',
  mode: 'DEV',                    // 'DEV' | 'PROD' (default: 'PROD')
  sampleRate: 0.01,                // override (PROD only, default: 0.01)
  anomalyThreshold: 0.7,           // override (PROD only, default: 0.7)
  devOutput: 'console',            // 'ui' | 'console' | 'both' (default: 'console')
  onAnomaly: (node) => alert(node) // optional callback
})
```

- **DEV**: full fidelity, no sampling, console tree output, all events submitted.
- **PROD**: two-tier sampling (1% base + anomaly always-capture), signed, hot span tracking.

---

## 2. Manual Instrumentation — `trace()` (implemented)

Wrap any function call with automatic timing, hashing, and sampling:

```typescript
const { result, event } = await invariance.trace({
  agentId: 'research-agent',
  action: {
    type: 'ToolInvocation',
    tool: 'web_search',
    input: query
  },
  fn: () => searchTool(query)
})
```

Returns `{ result: T, event: TraceEvent }`. On error, the error is re-thrown with a `traceEvent` property attached.

Optional params: `sessionId` (default: `'default'`), `spanId`, `parentNodeId`, `metadata: { depth, tokenCost, toolCalls }`.

---

## 3. Behavioral Primitive Emission — `emit()` (implemented)

Fire-and-forget events that populate the backend semantic behavior graph:

```typescript
invariance.emit('DecisionPoint', {
  nodeId: '...',
  candidates: ['option_a', 'option_b'],
  chosen: 'option_a',
  depth: 3
})

invariance.emit('GoalDrift', {
  nodeId: '...',
  originalGoal: 'find papers',
  currentGoal: 'summarize news',
  similarity: 0.71
})

invariance.emit('SubAgentSpawn', {
  parentNodeId: '...',
  childAgentId: 'sub-agent-1',
  depth: 2
})

invariance.emit('ToolInvocation', {
  nodeId: '...',
  tool: 'web_search',
  inputHash: '...',
  outputHash: '...',
  latencyMs: 45
})
```

All emissions are async, fire-and-forget via `transport.submitBehavioralEvent()`. They never block agent execution.

---

## 4. Framework Adapters (implemented)

Separate sub-path imports so unused framework deps aren't bundled:

```typescript
// LangChain
import { InvarianceLangChainTracer } from '@invariance/sdk/adapters/langchain'
const tracer = new InvarianceLangChainTracer(invariance.tracer, 'session-123')

// CrewAI
import { InvarianceCrewAIMiddleware } from '@invariance/sdk/adapters/crewai'
const middleware = new InvarianceCrewAIMiddleware(invariance.tracer, 'session-123')

// AutoGen
import { InvarianceAutoGenMiddleware } from '@invariance/sdk/adapters/autogen'
const middleware = new InvarianceAutoGenMiddleware(invariance.tracer, 'session-123')
```

Each adapter hooks into the framework's native callback/middleware system and calls `tracer.emit()` internally.

---

## 5. DEV Mode Console Output (implemented)

In DEV mode, the tracer tracks a per-session event tree. Print it:

```typescript
invariance.tracer.printDevTree('session-123')
```

Output:

```
[Invariance DEV] Execution trace: session-123
├── [12ms] ToolInvocation: research-agent ✓
├── [45ms] ToolInvocation: research-agent ✓
├── [ANOMALY 0.82] DecisionPoint: research-agent ✓
└── Total: 57ms | 2 tool calls | 1 anomalies
```

Programmatic access:

```typescript
const events: TraceEvent[] = invariance.tracer.getDevTree('session-123')
```

---

## 6. Verification API (transport wired, backend not yet built)

```typescript
const proof = await invariance.verify(executionId)

// VerificationProof type:
{
  valid: boolean,
  executionId: string,
  chain: { nodeId, hash, actionType, anomalyScore }[],
  signedBy: string,
  anchored: boolean,
  anchoredAt?: Date,
  tamperedNodes?: string[]
}
```

Calls `GET /v1/trace/verify/:executionId`. The backend route doesn't exist yet.

---

## 7. Semantic Graph Query (transport wired, backend not yet built)

```typescript
const patterns = await invariance.queryGraph(`
  MATCH (s:SubAgentSpawn)-[:FOLLOWED_BY*1..5]->(g:GoalDrift)
  WHERE s.depth > 3
  RETURN count(*) as occurrences, collect(s.execution_id) as runs
`)
```

Calls `POST /v1/trace/graph/query`. The backend route and query parser don't exist yet.

---

## What Does NOT Change

- Core signing primitives (Ed25519)
- Hash chain logic (`createReceipt`, `verifyChain`)
- `sortedStringify()` and `sha256()` utilities
- Existing log submission flow (`session.record()`, transport batching)
- Existing public API surface (`record`, `session`, `agent`, `wrap`, `check`, `query`)

All SDK changes are additive. No breaking changes to existing integrations.

---

## Open / Closed Line

| Open (in SDK, public) | Proprietary (hosted, paid) |
|---|---|
| Signing primitives | Semantic graph engine |
| Hash chain verification format | Cross-customer anomaly intelligence |
| Log schema spec | Compliance dashboard + report generation |
| Framework adapter source | Verification API (hosted) |
| Manual instrumentation API | Enterprise GRC integrations |
| DEV mode run tree | SLA-backed audit attestation |

The SDK being open source is deliberate strategy — it's the data collection mechanism and distribution wedge. The hosted backend is where value is captured.
