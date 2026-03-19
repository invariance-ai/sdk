# Invariance SDK Roadmap

This file is the source of truth for end-to-end work in `invariance-sdk`.

## Current Branch Evaluation

### `feat/monitor-poll`

Live pair:

- SDK branch: `feat/monitor-poll` -> PR #21
- Core branch: `feat/monitor-eval-loop` -> PR #30

What this branch already adds:

- `onMonitorTrigger` and `monitorPollIntervalMs` on [src/types.ts](/Users/hardiksingh/CS/Projects/Invariance/invariance-sdk/src/types.ts).
- Cursor-based monitor event polling through [src/transport.ts](/Users/hardiksingh/CS/Projects/Invariance/invariance-sdk/src/transport.ts).
- A guarded client-side poll loop in [src/client.ts](/Users/hardiksingh/CS/Projects/Invariance/invariance-sdk/src/client.ts) that:
  - avoids overlapping polls
  - advances an `after_id` cursor
  - routes callback failures to `onError`
- Exported `MonitorTriggerEvent` types and tests covering cursoring, callback isolation, and shutdown behavior.

What it proves:

- The SDK can consume backend-generated monitor events without changing receipt behavior.
- The SDK and core already line up on one paired capability slice: monitor event delivery from backend to client callback.

Current limitations to remember:

- Delivery is still polling-based, not websocket or SSE.
- The callback path is intentionally lightweight and does not yet include retry semantics, ack helpers, or reviewer actions.
- This branch consumes monitor events but does not define monitor management APIs in the SDK.
- The branch does not yet address the broader semantic trace contract, typed eval definitions, or higher-level instrumentation helpers.

Acceptance criteria for this slice:

- The SDK polls monitor events without overlapping in-flight polls.
- The event cursor advances monotonically and does not redeliver already consumed pages under normal operation.
- Per-event callback failures do not abort delivery of the rest of the batch.
- Polling failures surface through `onError` and back off on repeated server-side failures.
- Shutdown stops further polling without affecting receipt flushing behavior.

## End-State Buildout

`invariance-sdk` should end with these major capabilities:

1. Stable core client/session/receipt APIs that remain backward compatible.
2. Versioned semantic trace emission for decisions, tools, retrievals, outputs, and dependencies.
3. Adapters and helper APIs for instrumenting agent frameworks without custom backend logic.
4. Runtime monitor delivery, later upgraded from polling to live streaming when core supports it.
5. Replay, counterfactual, and evaluator result client methods for programmatic governance workflows.
6. Template/example packages that show full customer-support instrumentation and monitoring flows.

## Parallel Workstreams

These tracks should stay different enough that multiple agents can work at the same time with low overlap:

### Track A: Client And Transport

- Files: `src/client.ts`, `src/transport.ts`, `src/types.ts`
- Scope: new API surface, polling/streaming delivery, result-fetching helpers
- Keep receipt/session semantics stable
- Acceptance criteria:
  - new control-plane APIs are additive and do not regress session or receipt behavior
  - runtime event delivery supports both callback ergonomics and operational safety

### Track B: Observability Contract

- Files: `src/observability/*`, `src/normalize.ts`
- Scope: semantic trace schema, compatibility shims, dependency metadata, replay contracts
- Avoid editing core client behavior unless a new public API must be exposed
- Acceptance criteria:
  - the SDK can emit the canonical semantic trace schema expected by core
  - existing SDK tracing users keep working without forced migrations

### Track C: Framework Adapters

- Files: `src/adapters/*`, `src/observability/adapters/*`
- Scope: LangChain/CrewAI/AutoGen/raw fetch helpers that emit the canonical schema
- Keep adapter work isolated from client polling or contract management when possible
- Acceptance criteria:
  - each supported adapter emits enough context for root-cause and monitor evaluation in core
  - adapter upgrades do not require application-specific backend patches

### Track D: Examples And Docs

- Files: tests, examples, future README/docs files
- Scope: customer-support starter flows, monitor examples, migration guides
- Avoid mixing example work with transport internals
- Acceptance criteria:
  - docs show how to instrument, receive monitor events, and validate a full support-agent flow
  - examples stay aligned with the actual exported SDK surface

### Track E: Control-Plane Methods

- Files: client and transport additions only when required
- Scope: monitor CRUD, reviewer actions, replay/counterfactual helpers, evaluator result fetches
- Keep separate from trace-emission changes so multiple branches can move independently
- Acceptance criteria:
  - the SDK can manage monitors and fetch governance artifacts without requiring raw REST calls
  - control-plane methods remain separable from trace emission so multiple branches can proceed in parallel

## Pairing Rules

- Every new SDK capability should map to a specific backend contract in `invariance-core`.
- `feat/monitor-poll` is the consumer half of the current monitor event slice.
- Future SDK work should split into separate branches for:
  - monitor delivery/control-plane methods
  - semantic trace contract and instrumentation
  - adapter integrations
- Do not stack unrelated SDK work into a single branch if it would force multiple agents to edit `src/client.ts` at once.
