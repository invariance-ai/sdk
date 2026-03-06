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
  mode: 'DEV',                    // 'DEV' | 'PROD'
  sampleRate: 0.01,                // override (PROD only)
  anomalyThreshold: 0.7,           // override (PROD only)
  devOutput: 'console',            // 'ui' | 'console' | 'both'
  onAnomaly: (node) => alert(node) // optional callback
})
```

- **DEV**: full fidelity, no Ed25519 overhead, in-memory, console tree output.
- **PROD**: two-tier sampling, full signing, Redis/Supabase/S3 fanout.

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

The tracer handles signing, sampling decisions, storage write, and semantic graph emission automatically. The developer just wraps the function call.

---

## 3. Behavioral Primitive Emission (`emit`)

Fire-and-forget events that populate the semantic behavior graph:

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

All emissions are async, fire-and-forget. They never block agent execution.

---

## 4. Framework Adapters

Separate imports so unused framework deps aren't bundled:

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

Each adapter hooks into the framework's native callback/middleware system and calls the core tracer internally.

---

## 5. DEV Mode Console Output

In DEV mode, the tracer prints a structured tree to console:

```
[Invariance DEV] Execution trace: exec_abc123
├── [0ms] Agent: research-agent (goal: "find recent AI papers")
│   ├── [12ms] ToolInvocation: web_search ✓
│   ├── [45ms] ToolInvocation: web_fetch ✓
│   ├── [ANOMALY 0.82] DecisionPoint: chose external search over cache
│   └── [89ms] GoalDrift detected (similarity: 0.71)
└── Total: 146ms | 3 tool calls | 1 anomaly
```

Access programmatically:

```typescript
const events = invariance.tracer.getDevTree('session-123')
invariance.tracer.printDevTree('session-123')
```

---

## 6. Verification API

Cryptographic proof of chain integrity via the hosted verification API:

```typescript
const proof = await invariance.verify(executionId)

// Returns:
{
  valid: boolean,
  executionId: string,
  chain: [...],
  signedBy: string,
  anchored: boolean,
  anchoredAt?: Date,
  tamperedNodes?: string[]
}
```

This is the artifact enterprises hand to regulators.

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

---

## What Does NOT Change

- Core signing primitives (Ed25519)
- Hash chain logic
- `sortedStringify()` and `sha256()` utilities
- Existing log submission flow
- Any existing public API surface (`record`, `session`, `agent`, `wrap`, `check`, `query`)

All SDK changes are additive. No breaking changes.

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
