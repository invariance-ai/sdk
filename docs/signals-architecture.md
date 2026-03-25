# Signals Architecture

## End Goal

The SDK should reflect the platform's layered model clearly:

1. Instrumentation
2. Evidence
3. Evaluation
4. Operational events
5. Analysis and UX

This means:
- trace instrumentation remains the execution ledger
- signals become the operational event primitive
- monitors/checkers evaluate traces and create signals

## Layer Model

### Instrumentation

The SDK should make instrumentation easy for any runtime.

It should support:
- direct step recording
- wrappers for tool calls, decisions, handoffs, and sub-agents
- adapters for framework callback systems

Instrumentation should write trace nodes.

### Evidence

The evidence layer is:
- trace nodes
- receipts
- hash-chained execution records

This layer answers: what happened?

### Evaluation

The evaluation layer is:
- monitors
- detectors
- checkers
- score-based triggers

This layer consumes execution facts and decides whether a signal should be created.

### Operational Events

The operational layer is `signals`.

Signals answer: what needs attention?

Signals should be:
- durable
- queryable
- owner-scoped
- acknowledgeable
- easy to poll from agents

### Analysis and UX

This layer includes:
- query
- NL-query
- dashboards
- replay/debug views

## SDK Rules

- Do not conflate signal creation with trace creation.
- Trace APIs record execution facts.
- Signal APIs emit actionable findings.
- Keep monitor-event polling only as compatibility.
- Prefer `signals` naming for all new surfaces.

## Current Direction

This repo now exposes:
- `SignalsResource`
- `SignalPoller`
- `onSignal`
- `emitSignal()`

while keeping monitor polling as a deprecated compatibility path.
