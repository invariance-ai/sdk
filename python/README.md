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

## `@traced` Decorator

Use `@traced(primitive="...")` as syntactic sugar over `session.wrap()`. The `primitive` parameter is required — it declares the behavioral intent of the traced function.

```python
import asyncio
import invariance

async def main():
    client = invariance.init(api_key="dev_...", agent="my-agent")

    @invariance.traced(primitive="tool_invocation")
    async def search_web(query: str) -> dict:
        return {"results": ["result1", "result2"]}

    result = await search_web("hello")  # recorded automatically

    await client.shutdown()

asyncio.run(main())
```

### Overrides

Pass `client=` or `agent=` to override the defaults set by `invariance.init()`:

```python
@invariance.traced(primitive="decision_point", client=other_client, agent="review-agent")
async def decide(ctx: dict) -> dict:
    return {"decision": "allow"}
```

### Grouped Sessions

Use `trace_session()` to record multiple decorated calls into a single session:

```python
async with invariance.trace_session(name="pipeline-run"):
    await search_web("hello")
    await decide({"task": "review"})
    # both recorded in the same session with a linked hash chain
```

### Sync Functions

Sync decorated functions are supported only when no event loop is already running:

```python
@invariance.traced(primitive="tool_invocation")
def sync_tool(query: str) -> dict:
    return {"answer": query}

# Works outside an event loop (e.g., scripts)
result = sync_tool("hello")

# Raises InvarianceError("SYNC_TRACE_UNSUPPORTED") if called
# from within a running event loop — use async functions instead.
```
