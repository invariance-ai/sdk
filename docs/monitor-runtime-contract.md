# Monitor Runtime Contract

This document explains what the canonical monitor contract PR changes in `invariance-sdk`.

The companion backend work lives in `invariance-core`.

## What This PR Introduces

The SDK now exports the canonical monitor type vocabulary from:

- `src/types/monitor.ts`

That includes types for:

- monitor families
- scopes
- target matching
- trigger variants
- evaluator variants
- action variants
- backend event names
- execution and finding status values

This gives SDK consumers a stable shared language for monitor definitions that matches the backend contract.

## Important Current Limitation

This PR primarily aligns type definitions.

It does not yet add a full typed resource surface for:

- monitor executions
- monitor findings
- monitor backend events

It also still keeps legacy compatibility fields in the definition contract:

- `type`
- `target`
- `match`
- `rules`
- `signal`

So this PR should be read as:

- canonical type alignment
- backward-compatible SDK surface

not:

- full typed SDK support for every new monitor API endpoint

## What Consumers Can Safely Use

After this PR, consumers can safely use the SDK types as the canonical schema reference for:

- monitor definition authoring
- trigger/evaluator/action payloads
- shared naming across frontend and backend

## What Follow-Up SDK Work Still Needs To Do

The next SDK follow-up should add typed support for:

1. monitor execution list responses
2. monitor finding list responses
3. monitor backend event payloads
4. resource methods that map to the new monitor query endpoints
