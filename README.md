# @invariance/sdk

TypeScript SDK for recording, verifying, and querying AI-agent execution receipts with optional observability tracing and A2A transport helpers.

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
  apiUrl: 'http://localhost:3001',
});

const session = await inv.createSession({
  agent: 'agent-1',
  name: 'demo-run',
});

await session.record({
  agent: 'agent-1',
  action: 'analyze',
  input: { prompt: 'Summarize this trace' },
  output: { status: 'ok' },
});

const verification = await session.verify();
console.log(verification.valid);

await inv.shutdown();
```

## Development

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```
