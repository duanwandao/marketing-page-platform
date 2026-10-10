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
- AI Page Copilot proposals with human Apply / Discard

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

`pnpm dev` starts Builder and the local agent server. Configure the server in `.env` (never in Builder code):

```bash
AI_API_KEY=
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=
PORT=8787
```

Copy `.env.example` to `.env` in the repository root and fill in `AI_API_KEY` and `AI_MODEL`. The agent server loads that file automatically when `pnpm dev` starts; keep `.env` local and do not commit it.

For example, ask: `Create a Mid-Autumn promotion page with a festive banner, a coupon, and a recommended product section.` The Copilot uses real tool calling to inspect the small component catalog and return a validated schema proposal. It does not save or publish until you explicitly Apply, then use the existing Save and Publish controls. RAG is intentionally not used yet because the catalog is small.

## Test

```bash
pnpm test
pnpm typecheck
pnpm build
```
