# Marketing Page Platform

Schema-driven marketing page builder with local page management, draft persistence, and published runtime rendering.

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

```text
Draft PageSchema
    ↓ Save
PageRecord.schema
```

```text
Draft PageSchema
    ↓ Publish
PageRecord.publishedSchema
    ↓
Published Runtime
    ↓
PageRenderer
```

## Key Features

- Schema Driven
- Component Registry
- Config Driven Property Panel
- Shared Renderer
- Page List and Page CRUD
- Explicit Draft Saving
- Published Schema Snapshots
- localStorage Repository
- Low Coupling
- High Cohesion

## Routes

- `/` lists, creates, opens, and deletes pages.
- `/builder/:pageId` loads and edits a page draft.
- `/pages/:pageId` renders the most recently published snapshot.

Saving only updates the editable `schema`. Publishing saves that draft and copies it into `publishedSchema`, so later draft saves do not change the live page.

## Run

```bash
pnpm install
pnpm dev
```

## Test

```bash
pnpm test
pnpm typecheck
pnpm build
```
