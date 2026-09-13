# Page Management, Persistence, and Publish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add persistent page management, explicit draft saving, snapshot publishing, and a renderer-only published runtime.

**Architecture:** Keep page-domain types and the asynchronous repository inside `apps/builder`; inject the repository into routed pages from the app composition root. Zustand owns only the active editable `PageSchema` and editor-session revision state, while published pages load `publishedSchema` and pass it directly to the existing `PageRenderer`.

**Tech Stack:** React 19, React Router 7, Zustand 5, TypeScript 5.9, Vitest, Testing Library, browser localStorage.

**Spec:** Approved requirements in `/Users/mac/.codex/attachments/6d08a0d5-e738-4c52-af43-4ee752955015/pasted-text.txt`.

## Global Constraints

- Keep `schema` and `publishedSchema` separate; Save must never change the published snapshot.
- Do not add a workspace package, backend, autosave, drag and drop, undo/redo, authentication, database, or AI capability.
- Renderer remains independent of Builder and Zustand.
- Builder must not branch on concrete business component types.
- Use explicit Save and Publish commands and preserve edits made while an earlier save is in flight.

---

### Task 1: Page repository and publish snapshot semantics

**Files:**
- Create: `apps/builder/src/pages/page-record.ts`
- Create: `apps/builder/src/pages/repository/page-repository.ts`
- Create: `apps/builder/src/pages/repository/local-storage-page-repository.ts`
- Create: `apps/builder/src/pages/repository/local-storage-page-repository.test.ts`

**Interfaces:**
- Produces: `PageRecord`, `CreatePageInput`, `UpdatePageInput`, `PageRepository`, and `LocalStoragePageRepository`.
- Enforces: `record.id === record.schema.id`, `record.title === record.schema.title`, defensive cloning, validated persisted data, and publish-time snapshot/timestamp creation.

- [x] Write repository tests for CRUD, cross-instance reload, defensive cloning, malformed storage, and the A → publish A → save B → publish B lifecycle.
- [x] Run the repository test file and confirm it fails because the repository modules do not exist.
- [x] Implement the smallest typed repository satisfying those behaviors using the `mpp.pages.v1` key and injected `Storage`, clock, and id generator.
- [x] Run the repository tests and refactor only while they stay green.

### Task 2: Nullable editor session and revision-safe saving

**Files:**
- Modify: `apps/builder/src/editor/store/editor-store.ts`
- Modify: `apps/builder/src/editor/store/editor-store.test.ts`
- Modify: `apps/builder/src/editor/Canvas/Canvas.tsx`
- Modify: `apps/builder/src/editor/PropertyPanel/PropertyPanel.tsx`

**Interfaces:**
- Consumes: `PageSchema`.
- Produces: `loadPage(schema)`, `updatePageTitle(title)`, `markSaved(revision)`, `revision`, and `lastSavedRevision` while retaining existing component actions.

- [x] Add failing tests proving title and component edits advance revision, load resets the session, save marks only its captured revision, and a later edit remains dirty.
- [x] Run the store tests and confirm the new expectations fail for missing state/actions.
- [x] Replace demo initialization with a nullable editor session and implement revision-aware actions.
- [x] Update Canvas and PropertyPanel to tolerate the nullable pre-load state, then run all existing builder store/property tests.

### Task 3: Page routes and application workflows

**Files:**
- Create: `apps/builder/src/pages/PageListPage.tsx`
- Create: `apps/builder/src/pages/PublishedPage.tsx`
- Create: `apps/builder/src/pages/NotFoundPage.tsx`
- Create: `apps/builder/src/pages/PublishedPage.test.tsx`
- Create: `apps/builder/src/editor/EditorPage.test.tsx`
- Modify: `apps/builder/src/editor/EditorPage.tsx`
- Modify: `apps/builder/src/editor/EditorToolbar.tsx`
- Modify: `apps/builder/src/App.tsx`
- Modify: `apps/builder/src/styles.css`

**Interfaces:**
- Consumes: a `PageRepository` prop at the application/page boundary and editor-store snapshots.
- Produces: `/`, `/builder/:pageId`, `/pages/:pageId`, and `*` routes; explicit Save and Publish controls; runtime rendering solely from `publishedSchema`.

- [x] Add failing runtime tests proving drafts are unavailable and published output comes from `publishedSchema`, not `schema`.
- [x] Add failing editor tests proving route-id loading, Save payload behavior, Publish snapshot behavior, title dirtiness, and revision-safe completion.
- [x] Implement PageListPage states and create/delete/open navigation.
- [x] Implement EditorPage load/save/publish orchestration and a presentational toolbar.
- [x] Implement PublishedPage and explicit routes, then run builder tests.

### Task 4: Documentation and complete verification

**Files:**
- Modify: `README.md`
- Modify: `docs/ARCHITECTURE.md`
- Modify: `package.json`

**Interfaces:**
- Documents: draft Save flow and published snapshot Runtime flow.
- Produces: root `pnpm build` forwarding to workspace packages that define build scripts.

- [x] Update documentation to describe only implemented page management, persistence, draft, and publish behavior.
- [x] Add `"build": "pnpm -r --if-present build"` to the root scripts.
- [x] Run `pnpm test`, `pnpm typecheck`, `pnpm --filter builder build`, and `pnpm build`.
- [x] Inspect `git diff --check`, `git diff --stat`, and final workspace status before reporting.
