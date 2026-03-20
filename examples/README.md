# Invariance SDK Examples

## Prerequisites

```bash
pnpm install
```

Optionally set your API key (examples fall back to `dev_test`):

```bash
export INVARIANCE_API_KEY=inv_...
```

## Running

Each example is a standalone TypeScript file. Run with `npx tsx`:

```bash
npx tsx examples/quickstart.ts
npx tsx examples/customer-support.ts
npx tsx examples/langchain-tracing.ts
npx tsx examples/multi-agent-settlement.ts
```

## What Each Example Demonstrates

| Example | Key Concepts |
|---------|-------------|
| `quickstart.ts` | Auto-generated keypair, session recording, basic actions |
| `customer-support.ts` | Tool calls, `wrap()` for auto-capture, `onMonitorTrigger` callback |
| `langchain-tracing.ts` | LangChain adapter, DEV mode tracing, behavioral primitives |
| `multi-agent-settlement.ts` | Two agents, contract lifecycle, bilateral cryptographic signatures |
