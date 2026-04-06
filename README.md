# Invariance SDK

Monorepo for the public Invariance SDKs.

## Layout

- `packages/typescript`: TypeScript package published as `@invariance/sdk`
- `packages/python`: Python package published as `invariance-sdk`

## Development

TypeScript:

```bash
pnpm install
pnpm --filter @invariance/sdk build
pnpm --filter @invariance/sdk test
pnpm --filter @invariance/sdk typecheck
```

Python:

```bash
cd packages/python
python -m pip install -e .[dev]
pytest
```
