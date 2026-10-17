# AI Copilot Workspace V2 — Technical Design & Implementation Plan

**Status:** Implementation-ready, subject to Codex repository verification  
**Date:** 2026-10-17  
**Repository:** `duanwandao/marketing-page-platform`  
**Target path:** `docs/superpowers/plans/2026-10-17-ai-copilot-workspace-v2.md`  
**Companion spec:** `docs/superpowers/specs/2026-10-17-ai-copilot-workspace-v2.md`  
**Reviewed commit:** `f3972b16729ab48a185421bfd824dba784042ad7`  
**Tech stack:** React 19, Vite 7, TypeScript, Zustand 5, Node.js, pnpm, Vitest, Testing Library.

> For Codex: Read the companion spec and inspect the current repository before modifying files. This plan is intentionally concrete but not a license to overwrite valid existing behavior. Adjust paths if the repository changed, explain differences in the final summary, execute in small testable phases, and do not stop after merely restyling the panel. Both real conversation context and human-approved page edits are required.

## 0. Code Review Findings (Verified Baseline)

| Current file | Verified behavior | V2 impact |
| --- | --- | --- |
| `apps/builder/src/editor/editor.css` | `.editor-layout` is `220px minmax(420px,1fr) 300px`; primitive fixed sidebars | Replace rigid layout with adaptive, resizable workspace |
| `apps/builder/src/editor/EditorPage.tsx` | Edit mounts editor columns, Preview mounts a separate renderer; mode switches unmount edit panels | Hoist or persist Copilot session; design persistent workspace shell |
| `apps/builder/src/editor/EditorSidebar.tsx` | Selecting a canvas component switches active tab to Properties | Remove surprising forced switch; add explicit workspace controls |
| `apps/builder/src/editor/copilot/CopilotPanel.tsx` | Single local instruction, response and pending revision; raw text/trace; proposal cleared after Apply/Discard | Add chat, per-page session, proposal lifecycle and diff UI |
| `apps/builder/src/editor/store/editor-store.ts` | Accepted draft PageSchema, selected ID, revision, `replacePageSchema`, Save dirty tracking | Preserve this ownership; do not move pending schema into editor draft |
| `apps/builder/src/editor/Canvas/Canvas.tsx` | Renders accepted schema only | Allow read-only proposal preview source and highlight; no mutation |
| `apps/builder/src/editor/copilot/agent-client.ts` | Sends `AgentRequest` to `/api/agent` | Support history/mode, optional abort signal, clear failures |
| `packages/schema/src/agent.ts` | `AgentRequest` has `instruction`, `currentPage`, `componentCatalog`; response has message, schema and trace | Extend request contract compatibly with bounded history and working-copy context |
| `apps/agent-server/src/agent.ts` | Each `runAgent` reconstructs system + one user message; max 8 tool iterations | Insert validated prior conversation messages before newest instruction |
| `apps/agent-server/src/http.ts` | Validates request; body capped at 262,144 characters | Strict history validation, size limits, reject spoofed roles |
| `apps/agent-server/src/tools.ts` | Request-local `workingPage`; `get_current_page`, `submit_page_layout`, `apply_page_changes` | Keep deterministic tools; starting copy may be pending candidate for refinement |
| `apps/agent-server/src/mutations.ts` | Atomic validation-driven page changes, generated server IDs | Reuse as-is unless tests find bugs |
| `apps/builder/package.json` | No existing UI component framework | Integrate Tailwind 4, shadcn/ui, Lucide within `builder` |

**Important distinction:** The October 13 feature provided *multi-request incremental editing of the latest applied page*, **not** multi-request conversation memory. The V2 feature must actually send and consume previous conversational turns.

## 1. Target Architecture

```text
EditorPage / WorkspaceShell
  ├── EditorToolbar (title / Save / Publish / mode)
  ├── ComponentRail + ComponentLibraryDrawer
  ├── CanvasWorkspace
  │     ├── editor draft via EditorStore
  │     ├── pending proposal via CopilotSessionStore (preview-only)
  │     ├── highlights / zoom / fit
  │     └── existing ComponentRenderer / PageRenderer
  └── AssistantWorkspace (resizable desktop / drawer mobile)
        ├── ConversationList
        ├── ProposalCard + SchemaDiff
        ├── Composer (selected-component context)
        ├── PropertyInspector / Inspector switch
        └── TechnicalTraceDisclosure

EditorStore                         CopilotSessionStore
  pageSchema (accepted only)          sessionsByPageId
  revision / save status              chat messages and decisions
  component selection                 pending proposal / base snapshot
  editing actions                     running/error state
           └───────────────┬───────────────────────┘
                           ↓
                  requestAgent(payload)
                           ↓
                   POST /api/agent
                           ↓
               validate request + history
                           ↓
             system + prior turns + new user
                           ↓
            Agent Loop -> existing tools
                           ↓
                    AgentResponse
                           ↓
        session pending proposal; compute diff
                           ↓
      Preview (read only) / Apply / Discard
                           ↓ Apply only
            EditorStore.replacePageSchema
                           ↓ Save / Publish only
                     PageRepository
```

### Hard invariants

1. `EditorStore.pageSchema` always represents the accepted draft. Proposed preview never writes it.
2. `PageRecord.publishedSchema` changes **only** through existing Publish workflow.
3. Cross-request chat history provides linguistic context, never overrides `get_current_page`.
4. A single request may run multiple tool calls; the existing tool executor remains the owner of request-local working copy and deterministic validation.
5. At most one pending proposal per page; a refinement supersedes that proposal, not the accepted draft.
6. Both component ID and PageSchema version are checked. Freshness checks consider accepted-draft revision **and** content snapshot on reload (because revisions reset).
7. No server session or database persistence; page-scoped chat persists locally in a bounded, versioned format.

## 2. Data Contracts

### 2.1 Extend `AgentRequest` (shared schema)

**File:** `packages/schema/src/agent.ts`

```ts
export type AgentHistoryMessage = {
  role: "user" | "assistant";
  content: string;
};

export type AgentWorkingCopyKind = "accepted_draft" | "pending_proposal";

export interface AgentRequest {
  instruction: string;
  currentPage: PageSchema;
  componentCatalog: AgentComponentDefinition[];
  /** Previous turns only; do NOT duplicate the current instruction. */
  history?: AgentHistoryMessage[];
  /** Describes the origin of currentPage; does not mean it has been applied. */
  workingCopyKind?: AgentWorkingCopyKind;
}
```

Use explicit, conservative bounds (recommended: at most 12 previous messages; each ≤ 1,500 characters; total ≤ 12,000 characters). Reuse project request size limit. The server must validate these bounds; the client also trims history before sending. Accept omitted `history` / `workingCopyKind` to preserve existing API tests and callers.

Do **not** send arbitrary client-provided role names, hidden `system` instructions, tool calls or raw trace contents in `history`. Validate role/content at HTTP boundary. If additional conversation metadata is sent to explain discarded/applied states, define narrow typed fields and treat them as untrusted; never accept a client-created system message.

### 2.2 Session/domain state (browser-only)

**New:** `apps/builder/src/editor/copilot/copilot-session-store.ts` (Zustand or a dedicated provider; choose one consistent implementation)

Suggested types; details may be refined after testing:

```ts
type MessageStatus = "sending" | "sent" | "failed";
type ProposalStatus = "pending" | "applied" | "discarded" | "outdated";

type ConversationMessage = {
  id: string;
  role: "user" | "assistant";
  text: string;
  createdAt: number;
  status?: MessageStatus;
  proposalId?: string;
};

type PendingProposal = {
  id: string;
  pageId: string;
  schemaVersion: number;
  baseRevision: number;
  baseDraftSnapshot: PageSchema;  // accepted draft at start of chain
  proposedSchema: PageSchema;     // latest refined candidate
  status: "pending" | "outdated";
  sourceMessageId: string;
  trace?: AgentResponse["trace"]; // in memory, not persisted by default
};

type PageCopilotSession = {
  pageId: string;
  messages: ConversationMessage[];
  pending: PendingProposal | null;
  composerDraft: string;
  requestStatus: "idle" | "running";
  error: string | null;
  selectedContextId: string | null;
};
```

Keep transient `AbortController`, async request tokens and active-page generation in a dedicated controller/hook or module; **do not serialize functions/controllers**. Avoid overloading `EditorStore` with conversational data. `proposalStatus` for historical messages can be separate metadata keyed by proposal ID, rather than keeping every entire old PageSchema forever.

**Persistence:** local storage key such as `mpp:copilot:v2:<pageId>`, versioned schema, bounded (e.g. most recent 50 displayed messages, each message clipped/rejected to a safe maximum), with robust parse-error handling. Persist session history and minimal current pending proposal metadata; do not persist debug traces or secrets. On hydrate, compare `baseDraftSnapshot` with freshly loaded accepted page content; if mismatched, mark pending outdated even when local `revision` is 0. Avoid sensitive data claims: this is local browser storage, cleared on user request.

### 2.3 Deterministic schema diff

**New:** `apps/builder/src/editor/copilot/schema-diff.ts`

```ts
type PageDiffEntry =
  | { kind: "prop_updated"; componentId: string; componentType: string;
      propKey: string; before: unknown; after: unknown }
  | { kind: "component_added"; componentId: string; componentType: string; index: number }
  | { kind: "component_removed"; componentId: string; componentType: string; index: number }
  | { kind: "component_moved"; componentId: string; from: number; to: number }
  | { kind: "title_changed"; before: string; after: string };

function diffPageSchemas(before: PageSchema, after: PageSchema): PageDiffEntry[];
```

Algorithm: map old/new components by **stable IDs**, identify add/removes, compare props by key and value (deep equality for JSON values), compute order changes meaningfully (avoid reporting spurious moves solely due to adds/removes; use relative ordering of surviving IDs), compare titles. For an existing ID with a changed type, treat as remove+add or a clearly labeled replacement. Use registry labels for readable field names and safe fallback. Do not present raw model text as authoritative diff. Handle unchanged/no-op, undefined/arrays and long values.

## 3. Conversation & Proposal Orchestration

### 3.1 Server prompt/message ordering

**Files:** `apps/agent-server/src/agent.ts`, `http.ts`, tests.

```ts
const messages: AgentChatMessage[] = [
  { role: "system", content: trustedSystemPrompt },
  ...validatedHistory.map(({ role, content }) => ({ role, content })),
  { role: "user", content: request.instruction }
];
```

Prompt additions:

- History is conversational context only; **the latest `get_current_page` observation is authoritative**.
- `workingCopyKind === "pending_proposal"` means the page is an *uncommitted candidate*; do not claim that user has applied/saved/published it.
- Resolve pronouns using dialogue **and** current component IDs; ask clarifications if still ambiguous.
- Older mentions of proposed/discarded changes may not describe the current working page. Avoid automatic reapplication.
- For targeted edits use `apply_page_changes`; retain `submit_page_layout` for explicit full creation/replacement.
- Continue existing error recovery behavior, iteration limit, atomic mutation semantics and sanitized traces.

The server remains stateless and reconstructs each request's bounded context. That is intentional: **true multi-turn semantics are achieved by resending real conversation turns**, not by pretending the existing per-request loop remembers previous HTTP calls.

### 3.2 Client request algorithm

The Copilot controller must derive state at send time, **not from stale captured React closures**:

```ts
async function sendUserMessage(instruction: string) {
  // 1. Guard empty text / duplicate request / wrong page.
  // 2. Read current accepted draft and revision from EditorStore.
  // 3. Retrieve page-scoped Copilot session.
  // 4. If there is a valid pending proposal, use it as currentPage;
  //    otherwise use a structured clone of accepted draft.
  // 5. Build history from successful PRIOR user/assistant messages;
  //    exclude the current instruction and all tool traces.
  // 6. Append visible user message, mark request running.
  // 7. POST /api/agent with currentPage, workingCopyKind, history.
  // 8. On return, verify request/page identity and accepted base freshness.
  // 9. Append assistant response; store latest proposal if valid.
  // 10. If response has no proposal (clarification), keep draft unchanged.
  // 11. On error, show retry, retain relevant prior pending state.
}
```

**Important policy for pending refinement:** Pending and accepted pages are distinct.

- First request: snapshot accepted page **D0**, server returns **P1**. Store `baseDraftSnapshot=D0` and `baseRevision=R0`.
- Second request *before Apply*: send `currentPage=P1`, `workingCopyKind=pending_proposal`, with prior dialogue, get **P2**. Keep original base **D0/R0**; replace pending candidate with **P2**.
- Display cumulative diff `diff(D0,P2)`; optionally show “this turn” diff `diff(P1,P2)` in message details.
- Apply **P2** only if live accepted draft still equals **D0** (or matches same page, version and base revision with full freshness check). Then mark both proposal chain and UI state applied.
- Discard leaves **D0** untouched; following request starts from current accepted draft.
- A failed/clarification refinement does **not** silently apply or erase P1. Preserve P1, with clear UI indicating it remains pending.
- When the server returns an actual successful zero-diff proposal, treat as no-op and disable Apply.

### 3.3 Race safety

- Distinguish active page ID, request token, base accepted draft and optionally `AbortController` for every request.
- Abort requests when navigating away if feasible, but **also** ignore late responses even if abort does not stop them.
- Do not reuse a pending proposal from one page on another page.
- Disallow concurrent sends in the same page session; ignore double-clicks.
- When manual change occurs, immediately mark the pending proposal stale and block Apply. Allow user to inspect its history, discard, or regenerate using latest draft.
- Use revision for same-session change detection **and** structural snapshot comparison after refresh to prevent false freshness caused by revision reset.
- Handle no-response, provider errors, clarification responses, tool-loop exhaustion, and server rejection without corrupting accepted state.

## 4. UI System and Workspace Design

### 4.1 Add modern UI primitives

**Files likely changed:**

- `apps/builder/package.json`, `pnpm-lock.yaml`
- `apps/builder/vite.config.ts`, `apps/builder/tsconfig.json` (for Vite/TSC path alias if required)
- `apps/builder/components.json` (shadcn configuration)
- `apps/builder/src/styles/global.css` and/or `src/styles/tokens.css`
- `apps/builder/src/components/ui/*`, `src/lib/utils.ts` (generated/owned shadcn source)

Use official **existing Vite project** setup for Tailwind CSS v4 + `@tailwindcss/vite`; configure one app-local `@/` alias in both Vite and TypeScript. Install shadcn/ui in `apps/builder` (not an unnecessary new monorepo package), and add only primitives that are actually used: `Button`, `Card`, `Badge`, `Tabs`, `Separator`, `ScrollArea`, `Tooltip`, `Dialog`, `Sheet`, `Textarea`, `Skeleton`, `DropdownMenu`, optionally `Resizable`, `Sonner` and relevant primitives. Use `lucide-react` for icons. Do not scaffold a new Vite app or blindly overwrite the existing global stylesheet. Review CLI-generated diffs carefully.

Official setup reference: https://ui.shadcn.com/docs/installation/vite

Tokens: neutral backgrounds, accent color, status palette, type sizes, spacing, consistent focus ring and shadow. Support light and dark tokens structurally; ship a polished light theme first, then implement the dark theme toggle as part of P1 visual refinement. Replace one-off button CSS only where beneficial, without changing business component visuals.

### 4.2 Workspace shell

**Change:** `EditorPage.tsx`, `EditorToolbar.tsx`, `EditorSidebar.tsx`, `editor.css`; **new** `WorkspaceShell.tsx`, `ComponentRail.tsx`, `CanvasWorkspace.tsx` as appropriate.

Layout guidance:

```text
┌─────────────────────────────────────────────────────────────────┐
│ Pages  | Page title | Draft/Saved | Edit Preview | Save Publish │
├───────┬──────────────────────────────────┬──────────────────────┤
│ Rail  │ Canvas toolbar: Fit  100% +/-     │ AI Copilot / Props   │
│       │                                  │──────────────────────│
│Comps  │    Page preview (centered)       │ Chat scroll          │
│       │                                  │ Proposal change card │
│       │                                  │ Trace collapsed      │
│       │                                  │──────────────────────│
│       │                                  │ Composer [Send]      │
└───────┴──────────────────────────────────┴──────────────────────┘
```

- Right panel default 440px; min ~360px, max ~640px, adjustable without losing readable canvas. Persist width locally if useful.
- Left compact rail ~64px with expandable component picker; preserve manual add component feature.
- Center canvas is flexible and scrolls independently; avoid fixed minimum widths that force horizontal overflow.
- On narrow windows use right drawer or full-screen assistant (shadcn Sheet) and preserve conversation state across opens/closes.
- Separate layout mode from session ownership: changing Edit/Preview should **not** destroy a pending proposal or chat. Preview renderer may switch while session provider/store remains mounted.
- Remove `EditorSidebar`'s effect that unconditionally switches to Properties on component selection.
- Use explicit state for active right workspace mode; have an obvious path to Properties and to AI.
- Tooltips for icon-only buttons; accessible names and keyboard navigation.

### 4.3 Copilot components

Suggested split; keep files small and composable, but do not create abstractions without use:

```text
apps/builder/src/editor/copilot/
  CopilotPanel.tsx                  // layout/container
  CopilotHeader.tsx                 // title, status, clear/debug controls
  ConversationList.tsx             // message scroll and empty state
  ChatMessage.tsx                  // user / assistant / error / clarification
  ChatComposer.tsx                 // input, send, selected-context chip
  ProposalCard.tsx                 // state, summary, Apply/Discard
  ProposalChangeList.tsx           // human-friendly schema diff
  ExecutionTrace.tsx               // collapsible developer details
  copilot-session-store.ts         // page-scoped session and lifecycle
  copilot-controller.ts (or hook)  // send/apply/discard orchestration
  schema-diff.ts                   // pure deterministic diff
  agent-client.ts                  // extend current fetch client
```

- The composer should be bottom-anchored, with stable height, Enter to send / Shift+Enter newline, IME guard, and clear loading UI.
- Chat messages scroll separately from canvas. Avoid injecting full trace JSON into the chat flow.
- Proposal summary cards show concrete changes and action status. Apply/Discard always remain discoverable; never hide pending controls after a long assistant reply.
- “Generate” can become “Send” or context-sensitive “Generate page” only in empty-page onboarding. Do not misleadingly call every small edit “Generate.”
- History messages should render untrusted model content as plain text/controlled Markdown, never dangerous HTML injection.
- Use modest onboarding sample prompts for blank pages; don't hard-code user page contents.
- Error states have retry affordances and are visible without destroying the user's work.

### 4.4 Canvas and inspector

**Files:** `Canvas.tsx`, `EditorComponentWrapper.tsx`, `PropertyPanel.tsx`, new optional `CanvasToolbar.tsx`.

- Canvas chooses accepted vs. pending `PageSchema` based on explicit preview toggle, not store mutation.
- Proposed preview is read-only: hide/disable move/delete/edit affordances to avoid mutating accepted draft while showing a different schema.
- Zoom (fit, 100%, +/-) only affects canvas rendering transform/viewport, not PageSchema data or published output.
- Component IDs from diff entries can highlight and scroll to matching canvas components when rendered.
- Clear visual banner indicates **Previewing AI proposal — Not applied**.
- Selected component stays linked to Properties, and “Edit with AI” fills contextual metadata (actual component ID/type) rather than overwriting conversation.
- Avoid forcing switch from AI tab to Properties on selection.

## 5. Work Packages (Execute in Order)

Each package must end with tests and a brief check-in or progress note. Code changes are allowed, but **do not implement all phases in a single opaque pass**. One feature branch with focused commits is sufficient; do not claim PR creation unless you actually create them.

### Phase 0 — Baseline and verification

**Tasks**

- [ ] Record current Git HEAD and inspect all affected files; compare with the paths above.
- [ ] Run existing `pnpm --filter builder test`, `pnpm --filter agent-server test`, workspace typechecks, and builder build. Record pre-existing failures; do not attribute them to V2.
- [ ] Review old spec/plan and test ownership; document existing invariants.
- [ ] Set up a controlled demo page containing Banner, Text, Coupon and ProductList, including duplicate-Coupon test fixture.

**Exit:** baseline report and no ambiguous architecture assumptions.

### Phase 1 — Design system + visually polished workspace skeleton (P0)

**Tasks**

- [ ] Integrate Tailwind v4 with current Vite app (not a second app), shadcn/ui and Lucide.
- [ ] Establish color, typography, spacing, focus states and reusable component conventions.
- [ ] Implement toolbar visual hierarchy, compact left rail, modern center canvas frame, right workspace shell.
- [ ] Implement resizable/collapsible right panel at large sizes and drawer/fallback behavior at narrow sizes.
- [ ] Keep all existing manual components, Save, Publish, Page Preview and Properties working.
- [ ] Replace fragile hard-coded width assumptions and fix scroll/overflow.

**Tests:** existing editor tests updated; shell renders at desktop/narrow widths; panels switch, collapse, resize without losing content. Capture screenshot snapshots or documented manual screenshots at 1440×900, 1280×800, ~390px.

**Exit:** substantial visible improvement **before** multi-turn API work, with no functional regressions.

### Phase 2 — Per-page chat session + conversation UI (P0)

**Tasks**

- [ ] Define typed session state and lifecycle reducer/store, separate from `EditorStore`.
- [ ] Add versioned page-scoped local persistence and bounded hydration; clear action.
- [ ] Build `ConversationList`, `ChatMessage`, `ChatComposer`, response/loading/error/clarification states.
- [ ] Implement Enter / Shift+Enter / IME, disabled send while running, retry and scroll behavior.
- [ ] Preserve conversations when toggling Properties, Preview, responsive drawer or navigating pages.
- [ ] Guard stale response ownership with page/request tokens; add abort signal where possible.

**Tests:** message order, keyboard, controlled composer, error/retry, page isolation, refresh recovery, switch tab/mode state preservation, storage corruption fallback, max history limit.

**Exit:** polished message UI and safe session persistence without pretending backend history works yet.

### Phase 3 — Real cross-request context on Agent API (P0)

**Tasks**

- [ ] Extend shared `AgentRequest` with bounded `history?` and `workingCopyKind?`.
- [ ] Extend `http.ts` validator; reject bad roles/non-string bodies/oversize history; preserve old requests without `history`.
- [ ] Update `agent.ts` message construction and prompt; keep `get_current_page` authoritative and 8-iteration tool loop.
- [ ] Update `agent-client.ts` and controller to submit **prior** dialogue, not the current instruction twice.
- [ ] Preserve clarify → answer → targeted edit; handle references to prior accepted changes and explicit corrections.
- [ ] Ensure no raw traces, fabricated tool role or system role from client reaches model messages.

**Tests:** spy on `AgentModelAdapter.complete` to verify actual messages over two separate `runAgent` invocations; `http.test.ts` invalid history cases; an ambiguous target followed by “second one” resolves correctly against fresh page state; old API remains functional.

**Exit:** genuinely multi-turn at API/model boundary, not just visually.

### Phase 4 — Proposal lifecycle + safe pending refinement (P0)

**Tasks**

- [ ] Move proposal ownership from `CopilotPanel` local state into per-page session state.
- [ ] Track accepted base draft/snapshot and proposal chain; implement send-while-pending refining the candidate.
- [ ] Implement Apply / Discard / Outdated / no-op states, required UI and race protection.
- [ ] Protect against manual editor changes, different page IDs, late responses and reload with reset revision.
- [ ] Keep prior pending candidate on a failed/clarification request; never apply automatically.
- [ ] Apply via existing `replacePageSchema`, leaving Save / Publish separate.

**Tests:** D0→P1→P2→Apply, D0→P1→Discard, D0→P1→manual edit→Outdated, double send/apply, asynchronous navigation, reload stale snapshot, failed refinement retains P1, no-op blocks Apply.

**Exit:** all proposal transitions deterministic and human-reviewed.

### Phase 5 — Structured diff + proposal preview (P0)

**Tasks**

- [ ] Implement pure `diffPageSchemas` with fixture tests.
- [ ] Build compact grouped change cards using component registry labels.
- [ ] Add Current Draft / Proposed Preview canvas toggle, highlight/jump support as feasible.
- [ ] Ensure preview never changes `EditorStore`, canvas edit controls or published snapshot.
- [ ] Move full execution trace into an expandable technical details area.

**Tests:** single prop update, unrelated data preservation, add/remove, title, real move vs shifted index, no-op, pending cumulative diff, preview does not dirty draft, trace hidden by default.

**Exit:** users can confidently understand and inspect a pending change.

### Phase 6 — Inspector, canvas, responsive and visual refinement (P1)

**Tasks**

- [ ] Add canvas zoom/fit toolbar and keyboard-accessible control names.
- [ ] Wire selected component ID into AI contextual prompt action and inspector toggle.
- [ ] Refine empty states, skeletons, tooltips, button hierarchy, typography, hover/focus/disabled styling.
- [ ] Verify mobile drawer composer and scroll layout, reduced motion and accessibility.
- [ ] Polish light visual theme thoroughly and implement dark theme toggle based on shared tokens without sacrificing core quality.

**Tests:** selected component does not hide AI; zoom does not modify page schema; selected-context ID is valid; keyboard/responsive behavior; accessibility smoke checks; dark/light preference and contrast.

**Exit:** coherent desktop/mobile product experience, not a patched demo.

### Phase 7 — End-to-end QA, screenshots, docs, regression (P0/P1)

**Tasks**

- [ ] Add integration tests for multi-turn and proposal lifecycle using deterministic scripted models (no live provider in CI).
- [ ] Optional Playwright smoke tests / screenshots if environment permits; otherwise provide exact manual QA steps and screenshots.
- [ ] Run workspace tests, typechecks and builds, then review `git diff` for unintended generated files or framework overrides.
- [ ] Update `docs/ARCHITECTURE.md` to reflect actual conversation contract, session persistence, UI shell and proposal lifecycle (the existing AI tool list there may be stale).
- [ ] Add user-facing guidance about local browser chat persistence and proposal-vs-draft-vs-publish semantics.
- [ ] Document notable UI decisions and open limitations; provide images of before/after visual results if practical.

**Exit:** Spec acceptance criteria A1–A15 demonstrated and test/QA evidence reported. Do not call unfinished phases completed.

### Phase 8 — Follow-on roadmap (P2)

- [ ] Offer sanitized copy/share of a readable change summary without exposing private trace arguments.
- [ ] Add compact conversation search or local session export, preserving browser-local privacy guarantees and current page scoping.
- [ ] Test sensitive-data filtering, export format, and user-facing errors.

**Exit:** Any P2 items not shipped remain clearly flagged in the final report, instead of being counted as complete.

## 6. Testing Matrix

| Layer | Minimum scenarios | Location |
| --- | --- | --- |
| Pure logic | property diff, add/remove/move, deep equality, no-op, cumulative preview | `schema-diff.test.ts` |
| Session store | per-page isolation, valid transitions, persistence bounds, stale snapshot on reload | `copilot-session-store.test.ts` |
| Copilot UI | message rendering, focus/IME/Enter, loading, error/retry, apply/discard, trace disclosure | `CopilotPanel.test.tsx` + component tests |
| API contract | compatible old payload, valid/invalid history, role spoofing, length/body rejection | `http.test.ts` |
| Agent | real message history order, clarify follow-up, current-page authority, tool recovery | `agent.test.ts` |
| Editor workflow | preview view changes, component selection, unchanged draft before Apply, Save/Publish behavior | `EditorPage.test.tsx`, `EditorSidebar.test.tsx` |
| Integration | create→refine pending→apply→follow-up update→discard→save/publish | targeted end-to-end or integration fixture |
| Visual/accessibility | desktop 1440/1280, narrow 390, no overflows, focus navigation, contrast, reduced motion | screenshots/manual or browser E2E |

**Recommended repo commands** (verify actual root scripts before using):

```bash
pnpm --filter builder test
pnpm --filter agent-server test
pnpm --filter builder typecheck
pnpm --filter agent-server typecheck
pnpm --filter builder build
```

Run workspace-wide commands where available. Keep provider/network calls mocked in deterministic automated tests.

## 7. Risks and Decisions

| Risk | Design decision |
| --- | --- |
| Chat UI looks multi-turn but model only sees last instruction | Require Agent API and model-adapter tests proving historical turns are sent |
| Model assumes rejected proposal was applied | Current working PageSchema + working-copy indicator always wins over history |
| Pending refinement accidentally mutates accepted draft | Store separate candidate, preview read-only, apply only via guarded store action |
| Reload resets `revision` to zero | Compare persisted base draft schema to actual hydrated draft, plus page ID/schemaVersion |
| Layout too cramped at 1280px | Resizable right panel, compact left rail, drawer fallback threshold |
| Shadcn CLI overwrites existing Vite/TS settings | Install into existing `builder`; inspect each generated config diff |
| New Tailwind CSS collides with business component CSS | Scope design-system work to Builder chrome; visually regression-test actual components |
| Large history exceeds request/provider limits | Client/server caps and windowing; no trace payloads in conversation history |
| Chat mixes page A and B on navigation | Page-keyed sessions, request tokens and mismatched-response rejection |
| Screenshots look nice but keyboard/semantics regress | Testing Library and manual accessible navigation / responsive QA |
| Provider token costs swell due to history | Send bounded recent prior messages only; never resend full accumulated traces or complete chat |
| Scope balloons into platform rewrite | No new backend DB, auth, RAG, DnD or renderer rewrite; commit by bounded phases |

## 8. Recommended File Change Map

**Likely modify:**

```text
apps/builder/package.json
apps/builder/vite.config.ts
apps/builder/tsconfig.json
apps/builder/src/styles/global.css
apps/builder/src/editor/EditorPage.tsx
apps/builder/src/editor/EditorToolbar.tsx
apps/builder/src/editor/EditorSidebar.tsx
apps/builder/src/editor/editor.css
apps/builder/src/editor/Canvas/Canvas.tsx
apps/builder/src/editor/Canvas/EditorComponentWrapper.tsx
apps/builder/src/editor/PropertyPanel/PropertyPanel.tsx
apps/builder/src/editor/copilot/CopilotPanel.tsx
apps/builder/src/editor/copilot/agent-client.ts
apps/builder/src/editor/copilot/copilot.css
packages/schema/src/agent.ts
apps/agent-server/src/agent.ts
apps/agent-server/src/http.ts
docs/ARCHITECTURE.md
```

**Likely create (only as needed):**

```text
apps/builder/components.json
apps/builder/src/components/ui/*
apps/builder/src/lib/utils.ts
apps/builder/src/editor/WorkspaceShell.tsx
apps/builder/src/editor/ComponentRail.tsx
apps/builder/src/editor/Canvas/CanvasToolbar.tsx
apps/builder/src/editor/copilot/copilot-session-store.ts
apps/builder/src/editor/copilot/copilot-controller.ts
apps/builder/src/editor/copilot/schema-diff.ts
apps/builder/src/editor/copilot/ConversationList.tsx
apps/builder/src/editor/copilot/ChatMessage.tsx
apps/builder/src/editor/copilot/ChatComposer.tsx
apps/builder/src/editor/copilot/ProposalCard.tsx
apps/builder/src/editor/copilot/ProposalChangeList.tsx
apps/builder/src/editor/copilot/ExecutionTrace.tsx
...matching focused tests
```

**Deliberately preserve unless a concrete bug requires adjustment:**

```text
packages/renderer/*
packages/components/*
packages/component-core/*
packages/component-registry/*
apps/agent-server/src/mutations.ts
apps/agent-server/src/validator.ts
apps/builder/src/pages/repository/*
```

## 9. Definition of Done / Codex Final Report Format

At the end of each phase, report:

1. **Implemented:** exact user-visible behavior and key files.
2. **Verification:** tests/typechecks/builds executed and their real results; no invented success.
3. **Visual check:** desktop and narrow screenshot paths or explicit manual QA instructions.
4. **Known gaps:** unfinished spec criteria with impact and follow-up phase.
5. **Next step:** one clear bounded implementation task.

At final completion, demonstrate the following exact workflow:

```text
Create page → proposal preview → user says “make the title shorter”
  (before Apply) → refined proposal → Apply → draft becomes dirty
→ user says “increase that coupon amount to 50”
  (after Apply; with real prior conversation context) → review diff
→ Discard → draft unchanged → Save → Publish
```

Then demonstrate a duplicate-component clarification follow-up and a stale-proposal rejection after manual edit. If any step fails, the project is **not** done.

## 10. Suggested Initial Codex Instruction

> Read the Spec at `docs/superpowers/specs/2026-10-17-ai-copilot-workspace-v2.md` and this plan. Confirm the current repository still matches baseline commit `f3972b1`; reconcile any changes before editing. Execute **Phase 0 and Phase 1 first**, including the modern Tailwind/shadcn-based visual workspace. Run relevant tests/build and provide a concise change summary. Then continue phase-by-phase through cross-request history, safe proposal refinement, diff preview and final polish. This is a full feature request, not just CSS polishing. Keep the existing PageSchema validation, Apply/Discard and Save/Publish guarantees. Ask only when an actual blocking product decision is required.
