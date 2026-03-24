# Invariance Python SDK

Python SDK for recording, signing, and verifying AI agent actions against the Invariance backend.

## Installation

```bash
pip install invariance-sdk
```

## Quick Start

```python
import asyncio
from invariance import Invariance

async def main():
    inv = Invariance.init(api_key="dev_...", private_key="...")

    session = inv.session(agent="my-agent", name="run-1")
    await session.record({"action": "search", "input": {"query": "hello"}})
    await session.end()

    await inv.shutdown()

asyncio.run(main())
```
