# Invariance SDK

TypeScript SDK for recording, signing, and verifying AI agent actions against the Invariance backend.

## Quick Reference

- **Package**: `@invariance/sdk` (npm)
- **Entry**: `src/index.ts` → `src/client.ts` (main `Invariance` class)
- **Build**: `pnpm build` (tsup)
- **Run tests**: `pnpm test`
- **Typecheck**: `pnpm typecheck`
- **Integration tests**: `pnpm test:integ` (requires `.env.demo`)

## Architecture

```
src/
├── client.ts         # Invariance class — main entry point
├── session.ts        # Session — groups hash-chained receipts
├── receipt.ts        # Receipt creation, chain verification, Ed25519 signing, SHA-256
├── crypto.ts         # HKDF key derivation for agent identities
├── transport.ts      # HTTP transport — batching, flushing, all API calls
├── http.ts           # fetchWithAuth helper
├── types.ts          # All type definitions
├── policy.ts         # Local policy engine
├── templates.ts      # Typed action definitions
├── errors.ts         # InvarianceError class
├── normalize.ts      # camelCase ↔ snake_case field normalization
├── index.ts          # Public exports
├── cli/              # CLI tool (`invariance` command)
└── observability/    # Tracer, types, framework adapters (LangChain, CrewAI, AutoGen)
```

## Usage Pattern

```typescript
import { Invariance } from '@invariance/sdk';

const inv = Invariance.init({ apiKey: 'dev_...', privateKey: '...' });

// Basic recording
const session = inv.session({ agent: 'my-agent', name: 'run-1' });
await session.record({ action: 'search', input: { query: 'hello' } });
session.end();

// Wrap with policy check + receipt
const { result, receipt } = await inv.wrap(
  { agent: 'my-agent', action: 'transfer', input: { to: '0x...' } },
  () => doTransfer(),
);

// Identity-bound agent (HKDF-derived keys)
const { result, receipt, identity } = await inv.wrapWithIdentity(
  () => doWork(),
  { identity: 'acme/compliance-agent', action: 'audit', input: {} },
);

// Register agent identity
await inv.registerAgent('acme', 'compliance-agent');

await inv.shutdown();
```

## Key Concepts

- **Receipts**: Hash-chained (`previousHash` → `hash`), Ed25519-signed. Created via `createReceipt()`.
- **Sessions**: Manage receipt chains. Lazy init (`session()`) or awaited (`createSession()`).
- **Transport**: Batches receipts, auto-flushes every 5s or at 50 receipts. Retries on 5xx.
- **Identity**: `deriveAgentKeypair(ownerKey, "org/name")` — HKDF-SHA256 derivation. Server only sees public keys.
- **Agents**: `inv.agent({ id, privateKey })` — scoped client with action allow/deny lists.
- **Contracts**: `proposeContract()`, `acceptContract()`, `deliver()`, `acceptDelivery()`, `dispute()`.
- **Observability**: `inv.trace()` for non-receipt tracing, `inv.emit()` for behavioral primitives.

## Conventions

- All crypto: `@noble/ed25519` + `@noble/hashes`. SHA-512 sync mode set at import time.
- `sortedStringify()` must match backend exactly — both produce identical deterministic JSON.
- SDK uses Web Crypto (`crypto.subtle`) for SHA-256 (async). Backend uses Node crypto (sync).
- Errors use `InvarianceError` with codes: `INIT_FAILED`, `API_ERROR`, `POLICY_DENIED`, `CHAIN_BROKEN`, `SESSION_CLOSED`, `FLUSH_FAILED`, `QUEUE_OVERFLOW`, `SESSION_NOT_READY`.
- Tests use vitest. Mock `fetchWithAuth` for transport tests.
- Framework adapters exported as `@invariance/sdk/adapters/langchain` etc.
