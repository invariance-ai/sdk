# Tracing and Monitors

How to instrument agent runs with the Invariance SDK so monitors can observe, evaluate, and alert on agent behavior.

## Core concepts

| Concept | What it is |
|---------|-----------|
| **Trace node** | A single recorded action an agent took — a tool call, a decision, a handoff, a constraint check. |
| **Session** | Groups trace nodes into one logical run. All nodes in a session share a `session_id`. |
| **Monitor** | A rule that evaluates trace nodes and emits **signals** when conditions are met. |
| **Signal** | An alert produced by a monitor — e.g. "high-risk decision detected". |
| **Finding** | A structured observation a monitor attaches to a specific node. |

## Submitting trace events

Use `inv.trace.submitEvents()` with a `TraceEventInput`:

```ts
import { Invariance } from '@invariance/sdk';

const inv = Invariance.init({ apiKey: 'inv_xxx' });

await inv.trace.submitEvents({
  session_id: 'session-123',
  agent_id: 'my-org/my-agent',
  action_type: 'tool_invocation',
  input: { tool: 'search', args: { query: 'patient labs' } },
  output: { results: ['...'] },
  metadata: {
    tags: ['search', 'medical'],
    tool_calls: ['search'],
  },
});
```

You can submit a single event or an array of events.

## Using trace builders

The SDK provides helper functions that reduce boilerplate for common event shapes:

```ts
import {
  buildToolInvocationEvent,
  buildDecisionEvent,
  buildConstraintCheckEvent,
  buildHandoffEvent,
} from '@invariance/sdk';

// Tool call
const evt = buildToolInvocationEvent({
  session_id: 'sess-1',
  agent_id: 'my-org/agent',
  tool: 'fetch_chart',
  args: { patient_id: 'p-123' },
  result: { chart: '...' },
  latency_ms: 150,
  tags: ['ehr'],
  custom_attributes: { pii_accessed: true },
});

await inv.trace.submitEvents(evt);
```

Available builders:

| Builder | action_type | Use case |
|---------|------------|----------|
| `buildTraceEvent` | any | Generic — use when no specialized builder fits |
| `buildToolInvocationEvent` | `tool_invocation` | External tool/API calls |
| `buildDecisionEvent` | `decision_point` | Agent chose between candidates |
| `buildConstraintCheckEvent` | `constraint_check` | Safety or policy checks |
| `buildHandoffEvent` | `sub_agent_spawn` | Delegating work to another agent |

All builders return a plain `TraceEventInput` — they don't hide the underlying model.

## session_id and agent_id

- **`session_id`**: Use one session per logical agent run. All nodes in a session form a hash chain the backend can verify.
- **`agent_id`**: The agent that performed the action. Format: `owner/agent-name`. In multi-agent runs, each agent uses its own `agent_id` within the same session.

## parent_id for tree structure

Set `parent_id` to link a node to its causal parent. This lets the backend build causal chains, replay timelines, and dependency graphs.

```ts
const { nodes: [parentNode] } = await inv.trace.submitEvents(triageEvent);

const childEvent = buildToolInvocationEvent({
  session_id: SESSION_ID,
  agent_id: 'my-org/chart-agent',
  parent_id: parentNode.id,  // links to the triage decision
  tool: 'fetch_chart',
  args: { ... },
});
```

## custom_headers vs custom_attributes

Both are optional fields you attach to trace events so monitors can target them.

### custom_headers

`Record<string, string>` — string-only routing values. Use for coarse-grained monitor routing.

```ts
custom_headers: {
  'x-monitor-kind': 'safety_check',
  'x-environment': 'production',
}
```

Monitors match on `trace.custom_headers.x_monitor_kind` (keys are normalized to snake_case).

### custom_attributes

`Record<string, string | number | boolean | null>` — typed values. Use for fine-grained monitor conditions.

```ts
custom_attributes: {
  risk_tier: 'high',
  confidence: 0.92,
  pii_accessed: true,
  override_reason: null,
}
```

Monitors match on `trace.custom_attributes.risk_tier`, `trace.custom_attributes.confidence > 0.5`, etc.

### When to use which

| Need | Use |
|------|-----|
| Route to a specific monitor category | `custom_headers` |
| Monitor needs to compare numeric thresholds | `custom_attributes` |
| Boolean flags (pii, safety, human-review) | `custom_attributes` |
| Environment / deployment metadata | `custom_headers` |

## How monitors use traces

Monitors evaluate trace nodes as they arrive. There are three monitor types:

### Backend rule monitors

Pattern-match on trace fields using a declarative rule:

```
trace.action_type == 'constraint_check' && trace.output.passed == false
```

```
trace.custom_attributes.risk_tier == 'high' && trace.action_type == 'decision_point'
```

### Code monitors

Run a JavaScript function against each trace node. Access `custom_headers` and `custom_attributes` directly:

```js
export default function evaluate(node) {
  if (node.custom_attributes?.pii_accessed && node.action_type === 'tool_invocation') {
    return { signal: true, severity: 'warning', message: 'PII accessed via tool call' };
  }
}
```

### Cron monitors

Run on a schedule, query accumulated trace data, and emit signals for aggregate patterns (e.g. "more than 10 failed constraint checks in the last hour").

## End-to-end example

A multi-agent medical workflow with three nurse agents:

```ts
import { Invariance, buildDecisionEvent, buildToolInvocationEvent, buildConstraintCheckEvent } from '@invariance/sdk';

const inv = Invariance.init({ apiKey: process.env.INVARIANCE_API_KEY! });
const SESSION = `nurse-${Date.now()}`;

// 1. Triage nurse decides urgency
const triage = buildDecisionEvent({
  session_id: SESSION,
  agent_id: 'hospital/triage-nurse',
  candidates: ['discharge', 'workup', 'emergency'],
  chosen: 'workup',
  custom_attributes: { risk_tier: 'high' },
});
const { nodes: [triageNode] } = await inv.trace.submitEvents(triage);

// 2. Chart nurse fetches patient data
const chart = buildToolInvocationEvent({
  session_id: SESSION,
  agent_id: 'hospital/chart-nurse',
  parent_id: triageNode.id,
  tool: 'fetch_patient_chart',
  args: { patient_id: 'pt-4821' },
  result: { troponin: 0.04 },
  custom_attributes: { pii_accessed: true },
});
const { nodes: [chartNode] } = await inv.trace.submitEvents(chart);

// 3. Safety nurse checks medication dosage
const safety = buildConstraintCheckEvent({
  session_id: SESSION,
  agent_id: 'hospital/safety-nurse',
  parent_id: chartNode.id,
  constraint: 'dosage_within_range',
  passed: false,
  details: { medication: 'metoprolol', current: '200mg', max: '100mg' },
  custom_attributes: { severity: 'critical', requires_human_review: true },
});
await inv.trace.submitEvents(safety);
```

A backend rule monitor configured as:

```
trace.action_type == 'constraint_check' && trace.output.passed == false && trace.custom_attributes.severity == 'critical'
```

would fire a signal on the dosage check node, flagging it for human review.

See `examples/medical-nurse-agents.ts` for the full runnable version.
