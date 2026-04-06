# Invariance SDK

Public SDK repository for Invariance.

This repo contains:

- `src/`: TypeScript SDK source for `@invariance/sdk`
- `python/`: Python SDK source for `invariance-sdk`
- `examples/`: TypeScript usage examples

## Packages

### TypeScript

```bash
pnpm add @invariance/sdk
```

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

### Python

```bash
pip install invariance-sdk
```

```python
import asyncio
from invariance import Invariance


async def main() -> None:
    inv = Invariance.init(
        api_key="inv_...",
        private_key="...",
    )

    session = inv.session(agent="agent-1", name="demo-run")
    await session.record({
        "action": "analyze",
        "input": {"prompt": "Summarize this trace"},
        "output": {"status": "ok"},
    })

    await session.end()
    await inv.shutdown()


asyncio.run(main())
```

See `python/README.md` for Python-specific usage details.

## Development

TypeScript SDK:

```bash
pnpm install
pnpm build
pnpm test
pnpm typecheck
```

Python SDK:

```bash
cd python
python -m pip install -e .[dev]
pytest
```
