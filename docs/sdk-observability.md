# Invariance SDK — Observability API

## Overview

The SDK exposes the observability module from `invariance-core` as the public surface developers install. All changes are additive — existing signing primitives, hash chain logic, and public API surface are unchanged.

---

## 1. Initialization

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

## 2. Manual Instrumentation (`trace`)

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

The tracer handles signing, sampling decisions, storage write, and semantic graph emission automatically. Returns `{ result: T, event: TraceEvent }`. On error, the error is re-thrown with a `traceEvent` property attached.

Optional params: `sessionId` (default: `'default'`), `spanId`, `parentNodeId`, `metadata: { depth, tokenCost, toolCalls }`.

---

## 3. Behavioral Primitive Emission (`emit`)

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

All emissions are async, fire-and-forget. They never block agent execution. The transport normalizes camelCase to snake_case for the backend.

---

## 4. Framework Adapters

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

## 5. DEV Mode Output

In DEV mode, the tracer tracks a per-session event tree.

**Console output** (default):

```typescript
invariance.tracer.printDevTree('session-123')
```

```
[Invariance DEV] Execution trace: session-123
├── [12ms] ToolInvocation: research-agent ✓
├── [45ms] ToolInvocation: research-agent ✓
├── [ANOMALY 0.82] DecisionPoint: research-agent ✓
└── Total: 57ms | 2 tool calls | 1 anomalies
```

**Programmatic access:**

```typescript
const events: TraceEvent[] = invariance.tracer.getDevTree('session-123')
```

**Local UI server** (`devOutput: 'ui'`): spin up a local server on a configurable port (default 4321), serve a simple run tree UI showing execution tree, input/output at each node, latency, errors. Auto-opens in browser on first run.

---

## 6. Verification API

Cryptographic proof of chain integrity via the hosted verification API:

```typescript
const proof = await invariance.verify(executionId)

// VerificationProof:
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

This is the artifact enterprises hand to regulators. The SDK method is the public entry point, the backend does the actual verification work including Merkle proof checks against the cold tier.

---

## 7. Semantic Graph Query

Agents can query their own execution history programmatically:

```typescript
const patterns = await invariance.queryGraph(`
  MATCH (s:SubAgentSpawn)-[:FOLLOWED_BY*1..5]->(g:GoalDrift)
  WHERE s.depth > 3
  RETURN count(*) as occurrences, collect(s.execution_id) as runs
`)
```

This is the agent-queryable surface. Agents can use this to check their own execution history before making decisions.

---

## 8. Replay + Counterfactual APIs

Enable replay capture at init:

```typescript
const invariance = Invariance.init({
  apiKey: 'inv_...',
  privateKey: '...',
  captureReplaySnapshots: true,
  replayContext: { type: 'window', size: 10 } // 'full' | 'last' | 'window'
})
```

Fetch replay timeline and snapshots:

```typescript
const timeline = await invariance.replayTimeline('sess-123')
const snapshot = await invariance.nodeSnapshot(timeline[0].nodeId)
```

Branch a counterfactual run:

```typescript
const result = await invariance.counterfactual({
  branchFromNodeId: '01HX...',
  modifiedInput: { prompt: 'alternative input' },
  modifiedActionType: 'ToolInvocation',
  tag: 'alt-a'
})
```

Replay/counterfactual transport methods accept and normalize both snake_case and camelCase API payloads. SDK return values are always camelCase.

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
