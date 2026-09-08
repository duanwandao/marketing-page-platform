# Marketing Page Platform

Schema-driven marketing page builder for Phase 1 platform validation.

## Architecture

```text
PageSchema
    ↓
ComponentRegistry
    ↓
Renderer
```

```text
Builder
    ↓
EditorStore
    ↓
PageSchema
```

## Key Features

- Schema Driven
- Component Registry
- Config Driven Property Panel
- Shared Renderer
- Low Coupling
- High Cohesion

## Run

```bash
pnpm install
pnpm dev
```

## Test

```bash
pnpm test
pnpm typecheck
```
