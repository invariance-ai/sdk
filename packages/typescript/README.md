# @invariance/sdk

TypeScript SDK for recording, verifying, and querying AI-agent execution receipts with tracing, monitors, and transport helpers.

## Install

```bash
pnpm add @invariance/sdk
```

## Basic Usage

```ts
import { Invariance } from '@invariance/sdk';

const inv = Invariance.init({
  apiKey: process.env.INVARIANCE_API_KEY!,
  privateKey: process.env.INVARIANCE_PRIVATE_KEY!,
});

const session = inv.session({ agent: 'agent-1', name: 'demo-run' });

await session.record({
  action: 'analyze',
  input: { prompt: 'Summarize this trace' },
  output: { status: 'ok' },
});

session.end();
await inv.shutdown();
```
