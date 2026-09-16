# AI Page Copilot v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a stateless, tool-calling AI Copilot that returns a validated `PageSchema` proposal for explicit human application in the Builder.

**Architecture:** `apps/agent-server` owns HTTP, the OpenAI-compatible provider adapter, the bounded tool loop, request-local validation, and sanitized trace. `@mpp/schema` carries serializable request/response catalog contracts; Builder serializes registry definitions, calls `/api/agent`, and keeps proposal UI state local. Only `EditorStore.replacePageSchema` changes the draft after an explicit Apply, while the existing repository and renderer retain their lifecycle boundaries.

**Tech Stack:** TypeScript, Node `http` and `fetch`, React 19, Vite proxy, Zustand, Vitest, Testing Library, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-09-16-ai-page-copilot-v1-design.md`

## Global Constraints

- Expose only `list_components`, `get_component_definition`, `get_current_page`, and `submit_page_layout` to the model.
- Run at most 8 model/tool iterations; automated tests use injected fake adapters only.
- Never send a React component implementation, API key, environment configuration, system prompt, or hidden reasoning to the browser.
- Normalize every submitted component as `defaultProps + validated configSchema overrides`; reject unknown props, types, and invalid field values.
- Keep proposals request-local; Apply must not save or publish.
- Do not add RAG, embeddings, vector storage, streaming, generated images, authentication, databases, drag/drop, undo/redo, or conversation persistence.
- Keep `PageRenderer` independent from Builder and Zustand, and preserve published-snapshot rendering.

---

## File Structure

- `packages/schema/src/agent.ts` — browser/server serializable agent request, response, catalog, trace, and config-field contracts.
- `apps/agent-server/src/provider.ts` — provider-neutral message/model adapter interfaces and OpenAI-compatible `fetch` adapter.
- `apps/agent-server/src/tools.ts` — tool declarations, request-local tool executor, deterministic layout normalization, and sanitized trace summaries.
- `apps/agent-server/src/agent.ts` — eight-step model/tool loop returning `AgentResponse`.
- `apps/agent-server/src/http.ts`, `src/index.ts` — validated `POST /api/agent` handler and Node server startup.
- `apps/agent-server/src/*.test.ts` — fake-model tool-loop, validation, and HTTP-contract tests.
- `apps/builder/src/editor/copilot/*` — catalog serializer, fetch client, compact panel, and panel tests.
- `apps/builder/src/editor/store/editor-store.ts` — explicit draft replacement action.
- `apps/builder/src/editor/EditorPage.tsx`, `editor.css`, `vite.config.ts` — panel placement and same-origin development proxy.
- root `package.json`, `pnpm-lock.yaml`, `apps/agent-server/package.json`, `tsconfig.json` — workspace scripts and Node TypeScript runtime dependencies.
- `.env.example`, `README.md`, `docs/ARCHITECTURE.md` — safe setup and architecture/demo documentation.

### Task 1: Add shared serializable agent contracts

**Files:**
- Create: `packages/schema/src/agent.ts`
- Modify: `packages/schema/src/index.ts`
- Test: `packages/schema/src/agent.test.ts`

**Interfaces:**
- Produces `AgentConfigField`, `AgentComponentDefinition`, `AgentRequest`, `AgentTraceEvent`, and `AgentResponse` for both Builder and server.

- [ ] **Step 1: Write the failing contract test**

```ts
import { describe, expect, it } from "vitest";
import type { AgentResponse } from "./agent";

it("represents a proposal and a sanitized trace without executable component data", () => {
  const response: AgentResponse = {
    message: "Proposal ready.", proposedSchema: null,
    trace: [{ toolName: "list_components", arguments: {}, outcome: "success", summary: "4 components available" }]
  };
  expect(response.trace[0].toolName).toBe("list_components");
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @mpp/schema test -- agent.test.ts`

Expected: FAIL because `./agent` does not exist.

- [ ] **Step 3: Implement the minimal shared types and export**

```ts
export interface AgentConfigField { key: string; label: string; type: "text" | "number" | "image" | "color" | "switch"; }
export interface AgentComponentDefinition { type: string; name: string; defaultProps: Record<string, unknown>; configSchema: AgentConfigField[]; }
export interface AgentRequest { instruction: string; currentPage: PageSchema; componentCatalog: AgentComponentDefinition[]; }
export interface AgentTraceEvent { toolName: string; arguments: Record<string, unknown>; outcome: "success" | "error"; summary: string; }
export interface AgentResponse { message: string; proposedSchema: PageSchema | null; trace: AgentTraceEvent[]; }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @mpp/schema test -- agent.test.ts`

Expected: PASS.

### Task 2: Create agent-server validation and tool execution

**Files:**
- Create: `apps/agent-server/package.json`, `apps/agent-server/tsconfig.json`
- Create: `apps/agent-server/src/tools.ts`, `apps/agent-server/src/tools.test.ts`

**Interfaces:**
- Consumes `AgentRequest`, `AgentComponentDefinition`, and `PageSchema` from `@mpp/schema`.
- Produces `createAgentTools(request): AgentTools`, where `execute(name, rawArguments)` returns `{ success, observation, proposedSchema? }`.

- [ ] **Step 1: Write failing normalization tests**

```ts
it("preserves ProductList default products while applying its title override", () => {
  const result = tools.execute("submit_page_layout", { components: [{ type: "ProductList", props: { title: "Recommended" } }] });
  expect(result.proposedSchema?.components[0].props).toMatchObject({ title: "Recommended", products: expect.any(Array) });
});

it("returns validation errors for unknown props and incorrect config value types", () => {
  expect(tools.execute("submit_page_layout", { components: [{ type: "Coupon", props: { unknown: true } }] }).success).toBe(false);
  expect(tools.execute("submit_page_layout", { components: [{ type: "Coupon", props: { amount: "30" } }] }).success).toBe(false);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter agent-server test -- tools.test.ts`

Expected: FAIL because the workspace package and `createAgentTools` do not exist.

- [ ] **Step 3: Implement exactly four tool definitions and deterministic executor**

Implement JSON schemas for only the four specified names. `list_components` returns only `{ type, name }`; `get_component_definition` returns serializable metadata; `get_current_page` returns request current page. For `submit_page_layout`, validate object/array shape, clone defaults with `structuredClone`, permit only `configSchema` keys with text/image/color strings, number numbers, and switch booleans, assign `${type.toLowerCase()}-${index + 1}`, preserve current page id/version, and record summaries rather than raw observations in trace.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm --filter agent-server test -- tools.test.ts`

Expected: PASS for tool discovery, definition errors, current-page retrieval, allowed overrides, default preservation, invalid props/types, unknown types, and unique IDs.

### Task 3: Add provider adapter and bounded agent loop

**Files:**
- Create: `apps/agent-server/src/provider.ts`, `apps/agent-server/src/agent.ts`
- Create: `apps/agent-server/src/agent.test.ts`

**Interfaces:**
- Produces `AgentModelAdapter.complete(input): Promise<AgentModelTurn>` and `runAgent({ request, model, maxIterations? }): Promise<AgentResponse>`.
- `OpenAICompatibleModelAdapter` calls `${AI_BASE_URL}/chat/completions` using `AI_API_KEY` server-side and maps only assistant text/tool calls.

- [ ] **Step 1: Write failing scripted-model repair-loop test**

```ts
it("feeds an invalid submission observation back to the model before returning a corrected proposal", async () => {
  const model = new ScriptedModel([
    call("list_components", {}), call("get_component_definition", { type: "ProductList" }),
    call("submit_page_layout", { components: [{ type: "ProductList", props: { products: [] } }] }),
    call("submit_page_layout", { components: [{ type: "ProductList", props: { title: "Recommended" } }] }),
    text("Proposal ready.")
  ]);
  const response = await runAgent({ request, model });
  expect(response.proposedSchema?.components[0].props.products).toEqual(defaultProducts);
  expect(response.trace.filter((event) => event.outcome === "error")).toHaveLength(1);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter agent-server test -- agent.test.ts`

Expected: FAIL because `runAgent` and the adapter contract do not exist.

- [ ] **Step 3: Implement the loop and native fetch adapter**

Append assistant tool calls and JSON tool observations to model messages after each execution. Loop no more than 8 turns; return a clear no-proposal message after a model final response without successful `submit_page_layout` or after max iterations. Catch provider failures without returning provider headers/body or environment values. Keep all trace arguments recursively redacted for keys containing `key`, `secret`, `token`, or `authorization`.

- [ ] **Step 4: Run focused tests to verify they pass**

Run: `pnpm --filter agent-server test -- agent.test.ts`

Expected: PASS for actual multi-turn observation flow, repair after validation failure, no valid final layout, and max iteration termination.

### Task 4: Add the HTTP application and local development wiring

**Files:**
- Create: `apps/agent-server/src/http.ts`, `apps/agent-server/src/index.ts`, `apps/agent-server/src/http.test.ts`
- Create: `.env.example`
- Modify: `package.json`, `apps/builder/vite.config.ts`, `pnpm-lock.yaml`

**Interfaces:**
- Produces `createAgentHttpHandler(model): (request, response) => Promise<void>` serving only `POST /api/agent`.
- Root `pnpm dev` starts `builder` and `agent-server` in parallel; Vite proxies `/api` to `http://localhost:${PORT:-8787}`.

- [ ] **Step 1: Write a failing HTTP test**

```ts
it("accepts a valid agent request and rejects non-POST or malformed JSON without exposing configuration", async () => {
  expect((await request("POST", "/api/agent", validRequest)).status).toBe(200);
  expect((await request("GET", "/api/agent")).status).toBe(405);
  expect((await request("POST", "/api/agent", "not json")).status).toBe(400);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter agent-server test -- http.test.ts`

Expected: FAIL because the handler does not exist.

- [ ] **Step 3: Implement request validation and startup**

Limit body reads to 256 KiB; require non-empty `instruction`, a valid page-shaped `currentPage`, and an array-shaped serializable catalog. Instantiate `OpenAICompatibleModelAdapter` only at startup from server env; reject missing `AI_API_KEY`/`AI_MODEL` with an understandable generic response. Create `.env.example` with names only: `AI_API_KEY=`, `AI_BASE_URL=`, `AI_MODEL=`, `PORT=8787`.

- [ ] **Step 4: Run HTTP and workspace build checks**

Run: `pnpm --filter agent-server test -- http.test.ts && pnpm --filter agent-server typecheck && pnpm --filter agent-server build`

Expected: PASS.

### Task 5: Add Builder catalog serialization and proposal-only UI

**Files:**
- Create: `apps/builder/src/editor/copilot/component-catalog.ts`, `agent-client.ts`, `CopilotPanel.tsx`, `CopilotPanel.test.tsx`, `copilot.css`
- Modify: `apps/builder/src/editor/EditorPage.tsx`, `apps/builder/src/editor/editor.css`, `apps/builder/src/editor/store/editor-store.ts`

**Interfaces:**
- Produces `serializeComponentCatalog(registry): AgentComponentDefinition[]` with no `component` field.
- Produces `requestAgent(payload): Promise<AgentResponse>` using same-origin `POST /api/agent`.
- Adds `replacePageSchema(schema: PageSchema): void` to the editor store.

- [ ] **Step 1: Write failing Builder tests**

```tsx
it("shows an AI proposal without mutating the editor until Apply", async () => {
  render(<CopilotPanel requestAgent={fakeAgent} />);
  fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  await screen.findByText("Proposal ready.");
  expect(useEditorStore.getState().pageSchema).toEqual(originalSchema);
  fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
  expect(useEditorStore.getState().pageSchema).toEqual(proposal);
  expect(useEditorStore.getState().revision).toBe(1);
});

it("discards a proposal without altering the draft and renders sanitized trace events", async () => {
  // submit fake response, click Discard, assert original schema and trace labels
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter builder test -- CopilotPanel.test.tsx`

Expected: FAIL because the panel, client, serializer, and store action do not exist.

- [ ] **Step 3: Implement minimal accessible panel and draft replacement**

Place a compact panel below `PropertyPanel` in the edit sidebar, with a labelled textarea, `Generate`/`Running…` button state, `aria-live="polite"` result/error slot, disabled Apply until a proposal is present, Discard, and native `<details>` execution trace. Keep proposal/trace/loading/error local to the panel. On Generate serialize `componentRegistry.getAll()` to type/name/defaultProps/configSchema only and send the latest store schema. On Apply require matching page id/schemaVersion, call `replacePageSchema`, clear selection, increment revision only, and clear proposal; do not call repository callbacks.

- [ ] **Step 4: Run focused Builder tests to verify they pass**

Run: `pnpm --filter builder test -- CopilotPanel.test.tsx editor-store.test.ts`

Expected: PASS for catalog isolation, current-draft payload, visible proposal/trace, Discard, Apply dirty state, and no save/publish calls.

### Task 6: Document and verify the end-to-end feature

**Files:**
- Modify: `README.md`, `docs/ARCHITECTURE.md`
- Modify: `docs/superpowers/specs/2026-09-16-ai-page-copilot-v1-design.md` only if the checked-in source needs a non-product editorial correction.

- [ ] **Step 1: Add README operating instructions**

Document `pnpm dev`, the four environment keys, the local proxy, a Mid-Autumn example prompt, actual tool calling, and the intentional lack of RAG because the catalog is small.

- [ ] **Step 2: Add architecture data flow**

Add the approved diagram: `Builder → Agent API → LLM ↔ Tool Loop → Validated proposal → Human Apply → EditorStore → PageSchema`, and state that published runtime still receives only `publishedSchema` through `PageRenderer`.

- [ ] **Step 3: Run full automated verification**

Run: `pnpm test && pnpm typecheck && pnpm build && git diff --check`

Expected: all workspace suites, type checks, production builds, and whitespace check PASS.

- [ ] **Step 4: Run manual development smoke test**

Run: `AI_API_KEY=... AI_MODEL=... pnpm dev`

Expected: Builder starts with an `/api` proxy and agent server starts on configured `PORT`; create/open a page, submit the sample prompt, observe trace, Apply, see Unsaved changes, Save, Publish, then open the published route.

### Commit Boundaries

1. `docs: add AI Page Copilot v1 spec and implementation plan` — only `docs/superpowers/specs/2026-09-16-ai-page-copilot-v1-design.md` and this plan.
2. `feat: add AI page copilot v1` — shared contracts, agent server, Builder proposal UI, scripts, documentation, and tests.

Before each commit run `git status --short` and `git diff --stat`; stage only files in that boundary. After the implementation commit, run the full Task 6 verification again before pushing `main` to `origin`.
