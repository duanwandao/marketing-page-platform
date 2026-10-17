# AI Copilot Workspace V2 — Product Specification

**Status:** Ready for implementation review  
**Date:** 2026-10-17  
**Repository:** `duanwandao/marketing-page-platform`  
**Target path:** `docs/superpowers/specs/2026-10-17-ai-copilot-workspace-v2.md`  
**Reference baseline:** `main` at `f3972b16729ab48a185421bfd824dba784042ad7` (2026-10-15)  
**Related prior feature:** `docs/superpowers/specs/2026-10-13-ai-copilot-multi-turn-editing.md`

## 1. Background

The current editor supports page creation and editing through `PageSchema`, the component registry, a Zustand editor store, and a stateless agent server. The 2026-10-15 implementation added deterministic `apply_page_changes` and request-local working-page behavior. Human Apply/Discard remains in place.

However, the current experience is a narrow, form-like Copilot sidebar rather than an AI-first editing workspace. It has a fixed 300px right sidebar, raw textual proposals and traces, and only one visible response. More importantly, **the agent reconstructs messages for every HTTP request**; editing successive applied pages is possible, but follow-up references such as “make that a little shorter” do not reliably use earlier dialogue. A future-looking chat interface must correspond to real conversational context.

This specification covers a cohesive product upgrade: visual redesign **and** true multi-request conversation, with deterministic preview and explicit approval.

## 2. Product Vision

Make the platform feel like a polished, reliable AI-assisted marketing page builder:

1. The canvas remains the central visual artifact.
2. Copilot feels like an ongoing conversation, not a one-shot form.
3. Users can see **exactly what will change** before accepting a proposal.
4. Manual editor actions and AI proposals coexist without unexpected edits.
5. The interface looks production-grade using one coherent UI system.

**Primary audience:** Web developers, designers, and marketing-operations users creating pages with a catalog of reusable business components.

## 3. User Journeys

### 3.1 Create and iteratively refine

1. Open an empty draft. Ask “Create a Mid-Autumn promotion page with a banner, coupon, and product list.”
2. Copilot returns a proposed page and a structured summary; canvas can show the pending proposal in a **Preview Proposal** mode without changing the editor draft.
3. Say “Make the banner title shorter” **before applying**. This refines the pending proposal, not the committed draft.
4. Apply the refined proposal. The draft updates; status becomes unsaved. Nothing publishes automatically.
5. Say “Increase the coupon amount to 50.” Copilot uses the current draft plus relevant recent chat context, returns another proposal, and awaits approval.
6. Save and Publish using separate toolbar controls.

### 3.2 Clarify an ambiguous component

1. Page contains two coupons. User asks “Make the coupon bigger.”
2. Copilot asks which coupon; **no proposal is produced or applied**.
3. User replies “The first one.”
4. Copilot uses the preceding clarification exchange together with fresh page state to target the correct ID. If “bigger” is still ambiguous (amount vs. font size or unsupported field), it asks a further question rather than inventing a property.

### 3.3 Review, discard and recover

1. A pending change card shows Banner title **before → after**.
2. User chooses **Discard**; real draft is unchanged, and the conversation records a discarded proposal.
3. Later references must never treat discarded changes as applied.
4. If a manual edit occurs while AI is generating or while a proposal waits, the old proposal becomes **Outdated** and cannot be applied. The user can regenerate from the newest draft.

### 3.4 Edit selected component with AI

1. Select a Banner on the canvas.
2. Properties are available without dismissing the Copilot session.
3. “Edit with AI” focuses the composer and attaches a small selected-component context chip (ID/type/name, not an invented capability).
4. The agent still verifies the live page state and supported props before proposing changes.

## 4. Scope and Priorities

### P0 — Must ship together

- Modern cohesive design system: **Tailwind CSS v4 + shadcn/ui + Lucide icons**, integrated into existing Vite/React/pnpm workspace, using only necessary shadcn primitives.
- Redesign the editor shell and toolbar, component navigation, canvas framing, and Copilot workspace.
- Resizable, collapsible right workspace; reasonable minimum canvas space and responsive fallback.
- Chat-style message list with user/assistant/clarification/error messages, bottom-anchored composer, loading and retry states.
- **True cross-request conversational context**, including clarification follow-ups, using bounded recent history explicitly sent in `AgentRequest` (no server conversation database).
- Per-page session state that survives component/tab/view unmounting, navigation back to a page, and page refresh in the same browser through bounded local browser storage.
- Pending proposal **refinement before Apply**. The proposed working copy is clearly distinguished from the accepted draft.
- Deterministic schema diff summary (added, removed, modified, and order/title changes when applicable) rendered as readable change cards.
- Explicit Apply / Discard, proposal-preview toggle, and stale-proposal protection.
- Execution Trace hidden by default in an expandable technical area.
- Preserve Save / Publish semantics and existing mutation/validation safety.

### P1 — Complete the workspace

- Canvas zoom controls (fit, 100%, +/-) and responsive canvas viewport.
- Highlight affected components in proposed preview and provide jump-to-component from change cards.
- “Edit selected component with AI” entry point and component-context chip.
- Responsive drawer/full-screen Copilot behavior for small viewports.
- Empty states, suggestion prompts, accessible feedback, keyboard and motion refinements.
- Visible conversation clearing option, with appropriate confirmation and locally stored history removal.
- Light/dark theme toggle, using shared design tokens and preserving readable business components.

### P2 — Additional roadmap after P0/P1

- Copy/share a sanitized proposal summary.
- Compact conversation search or export.

P2 items are included in the broader roadmap, but are sequenced after the core workspace, multi-turn, preview and accessibility requirements. If implementation pauses after P1, report P2 as explicitly outstanding rather than silently claiming the whole roadmap is done.

**Priority rule:** Visual polish and correct interaction are first-class deliverables, not post-implementation cleanup.

## 5. Information Architecture & Layout

### 5.1 Desktop

Top bar: back navigation, editable page title, draft/published state, unsaved indicator, Edit/Preview, Save and Publish. Avoid a cluster of equally strong buttons; Publish is the primary page-level action.

Workspace: compact left component rail/library, flexible center canvas, right Copilot/Properties workspace. Copilot is the default working surface in the AI flow; Properties is one purposeful mode, not an automatic navigation side effect.

- Right workspace default: **440px**, user-resizable approximately **360–640px** when viewport permits.
- Compact left rail default: approximately 56–72px; opening the component library can reveal a wider panel.
- Main canvas must not become unusably narrow. Under the available-width threshold, right workspace becomes an overlay/drawer rather than squeezing the canvas.
- Dragging a divider updates panel dimensions smoothly; keyboard resizing and accessible labels are available if the chosen library supports them.
- User panel width preference may persist locally.
- Editor/Copilot state must survive Edit/Preview transitions.

### 5.2 Narrow screens

- Around 1024px and below, progressively collapse left library and prefer a drawer for Copilot.
- Around 768px and below, use one main workspace at a time with simple canvas/Copilot navigation and a usable composer.
- Never create horizontal page overflow or obscure Apply/Discard behind the onscreen keyboard.

### 5.3 Visual language

A restrained, modern developer-tool aesthetic (inspired by contemporary professional tools without copying any product): neutral surfaces, subtle outlines, clear type hierarchy, consistent spacing (4/8px rhythm), 8–12px corner radii, one primary accent color, differentiated success/warning/error states, Lucide icons, accessible contrast. Prefer a clean purposeful design over excessive gradients, glassmorphism, or visual noise.

Component library, property inspector, notifications, dialogs, buttons, cards, scroll regions, tooltips, and toggles must share the same design tokens and primitives. Business components in `packages/components` must keep their own domain styles; the design-system refactor should primarily affect Builder chrome.

## 6. Conversation Requirements

### 6.1 Message experience

- Message bubbles distinguish user and assistant; long output wraps and preserves basic paragraphs/code safely.
- A request is submitted by Enter; Shift+Enter inserts a newline; IME composition must not accidentally submit. A visible Send button remains available.
- Send is disabled on empty input and while an active request is running. Display a clear “Thinking…” or “Preparing changes…” state. Do not fabricate tool progress events from a non-streaming API.
- On failure, preserve the user's message and composer text or provide Retry without duplicating conversational turns.
- Clarification questions appear as assistant messages and can be answered in the same composer.
- Conversation is associated with **one page ID**; switching page must never mix chats or proposals.

### 6.2 True multi-turn behavior

- The server must receive a **bounded, recent** sequence of previous user/assistant messages on each request, not only the latest instruction.
- Server builds the trusted system message itself. Browser history is treated as **untrusted conversational data** and cannot insert `system`, `tool`, tool calls, or arbitrary role fields.
- The most recent current working `PageSchema` comes from the request's `currentPage` field and is exposed through `get_current_page`; it outranks references in older messages.
- Support anaphora (“that banner”), clarification responses (“the second coupon”), applied change references, and user corrections (“not that one”).
- Applied/discarded/outdated proposal statuses must be tracked so a past rejected proposal is not implicitly taken as current state.
- Bound history transmitted to the LLM (e.g., last 12 user/assistant messages, at most 1,500 characters each, total at most 12,000); enforce limits server-side and account for existing HTTP body size limit. Do not send raw traces in conversational history.
- Maintain the existing bounded Agent tool loop and deterministic tool validation. Do not rely on chat history to generate component IDs or infer unavailable props.

### 6.3 Session storage

- Keep an in-memory page-scoped Copilot session/store that survives UI mode/tab changes; persist a safe, versioned, size-bounded snapshot to browser local storage per page (conversation, statuses, pending proposal metadata).
- On reload, re-check any pending proposal against the freshly loaded page ID, schema version and **actual schema content/base snapshot**, not just a revision counter reset to zero.
- Store no API keys or provider credentials. Never persist raw unsanitized trace payloads by default. Provide Clear conversation.
- No backend DB or authenticated multi-device sync is required. This is browser-local continuity, not a claim of server memory.

## 7. Proposal Lifecycle and Review

### 7.1 States

`none → generating → pending → applied | discarded | outdated | failed` (state transitions may vary; no unreviewed implicit commit).

- **Pending:** Only one active pending proposal per page. A pending proposal has an original accepted-draft snapshot/reference, a `baseRevision`, and latest `proposedSchema`.
- **Refinement:** A new instruction while pending uses the pending schema as the temporary working input; the latest proposal supersedes the prior pending proposal, but **both remain uncommitted**. Show clearly “Refining pending proposal.” Change summary compares the latest proposal to the original accepted draft.
- **Apply:** Atomically replaces current draft if page identity/schema version/base revision (or equivalent robust content fingerprint) still matches and proposed schema is valid. Marks draft dirty; does not call Save or Publish.
- **Discard:** Removes pending proposal and preview, preserves accepted draft. Chat records that the proposal was discarded.
- **Outdated:** Manual draft mutation, page change or incompatible reload invalidates proposal. Apply is disabled; the user may discard or regenerate using latest draft.
- **Failed / clarification:** No new proposal is silently adopted. If there was an earlier pending proposal, retain or invalidate it deterministically; never replace it with null merely due to an unrelated failed request.

### 7.2 Visual diff

Compute differences from two actual `PageSchema` values in the client (or a deterministic shared helper), not from natural-language claims in the LLM output.

Display friendly cards for:

- Updated component properties: component type/name and property label, **old value → new value**.
- Added components and insertion position.
- Removed components.
- Page title changes, component order changes if produced by full-page replacement.
- No-op proposals: “No changes to apply”; disable Apply.

Handle long strings, arrays and non-configurable props sensibly: concise preview plus optional detail; do not dump raw JSON into the normal chat feed. Group many changes by component, with total counts.

### 7.3 Preview behavior

- Toggle **Current Draft / Proposed Preview** to render the pending schema using the existing shared renderer, without mutating `EditorStore`.
- Preview mode is visually distinguishable (label, border/background/toolbar indicator) and can highlight affected components.
- Discard or Apply returns to the accepted draft view appropriately.
- No proposal should appear on the public PublishedPage until the user separately publishes.

## 8. Inspector and Canvas

- Selecting a canvas component must **not automatically hide the active Copilot conversation**. Expose Properties via a predictable inspector tab/panel or contextual drawer.
- Component selection remains synchronized between Canvas and Properties; an “Edit with AI” action can preselect/contextualize a component but does not edit until a user sends a request and applies the response.
- Component navigation, selection outlines and move/delete affordances are visually clear, do not intercept normal preview rendering, and have accessible names.
- Provide zoom in/out, 100%, and fit-to-width for desktop. UI controls operate on the viewport presentation, never PageSchema.
- Small viewports, long pages and long conversations scroll independently.

## 9. Error, Reliability and Safety

- Missing API config, authentication errors, rate limits, connection errors, invalid model tool calls, timeouts, and validation errors have readable feedback and appropriate retry affordances.
- Duplicate sends must not trigger duplicate concurrent requests. A late result for a different page/session must be ignored.
- Pending proposals must not overwrite manual changes made during request or after proposal creation.
- Add abort handling for unmount/navigation when practical; guard results with request/page session tokens even when abort is not honored.
- All content from model/historical chat is untrusted: render text escaped by default and do not execute returned HTML. Do not allow conversational history to spoof tool/system roles.
- Preserve existing tool call trace sanitization and hide Trace behind a developer details expander.
- Keep `schemaVersion`, component definitions and mutation validation semantics intact. No unreviewed edits, auto-saving, or auto-publishing.

## 10. Accessibility and Performance

- Keyboard focus order, aria labels, semantic message regions, live announcements for state changes, accessible resizing and dialog behavior.
- Color contrast targets WCAG AA, and reduced-motion preference is respected.
- UI remains responsive on common laptops (e.g., 1280×800) and large desktops (1440×900 and 1920×1080); verify a narrow mobile viewport around 390px.
- Large trace records must not degrade the standard chat scroll. History/storage bounds are enforced, and memoization/virtualization is used only if evidence shows a need.
- No unavoidable layout shifts when sending, applying or resizing panels.

## 11. Non-goals

- Drag-and-drop layout design, RAG, multi-agent orchestration, publishing automation, authentication, collaborative editing, cloud-synced chats, streaming provider tokens, server-side chat database, public-site theme overhaul, arbitrary new business components.
- Do not rename existing agent tools or replace the deterministic mutation engine merely for UI styling.

## 12. Acceptance Criteria (Given / When / Then)

**A1 — visual workspace:** Given a 1440px desktop viewport, when the editor opens, then it shows a polished toolbar, left tools, central canvas and ~440px resizable AI workspace; no horizontal overflow or crowded primary controls.

**A2 — responsive:** Given a narrower viewport, when Copilot opens, then it appears in an accessible drawer/full-screen mode without compressing the canvas below usability.

**A3 — chat interaction:** Given an open page, when the user submits a message and receives a response, then both appear in order, composer remains usable, Enter/Shift+Enter work, and raw traces do not occupy the conversation by default.

**A4 — true clarification:** Given two Coupon components and prior assistant question “Which coupon?”, when user replies “The second one”, then the subsequent HTTP request contains bounded prior dialogue and the model can correctly target the second component ID using fresh page state; no earlier proposal was implicitly applied.

**A5 — applied-turn follow-up:** Given an accepted Banner title change, when user asks “Shorten that title again”, then the agent receives previous relevant dialogue plus the latest accepted PageSchema and proposes the next appropriate change.

**A6 — pending refinement:** Given a pending Banner title proposal, when user says “Make it more festive” without applying, then new proposal is based on the pending working copy, draft is unchanged, and the cumulative diff is shown relative to the original draft.

**A7 — safe Apply:** Given a pending valid proposal, when Apply is clicked, then editor draft changes exactly once, revision increments appropriately, Save becomes available, and published snapshot remains unchanged.

**A8 — Discard:** Given a pending proposal, when Discard is clicked, then editor draft is unchanged, preview disappears, and conversation marks the proposal discarded.

**A9 — outdated proposal:** Given a pending proposal, when a user manually edits the draft, then Apply is unavailable; the UI shows that the proposal is outdated and offers regeneration.

**A10 — persistence and isolation:** Given two pages, when switching pages and returning or refreshing, then each page restores its own bounded chat without mixing page IDs; pending proposals are revalidated and invalid ones are not applicable.

**A11 — deterministic diff:** Given a schema where only `Coupon.amount` changes from 20 to 50, when a proposal is shown, then its change card shows that property change and does not falsely list unrelated components.

**A12 — selected component:** Given an active Copilot conversation, when a canvas component is selected, then the conversation remains visible; Properties and Edit with AI remain available.

**A13 — regression:** Given existing page creation/editing, when tests run, then legacy submit_page_layout, apply_page_changes, validation recovery, local persistence, Save/Publish and published runtime continue to pass.

**A14 — delivery:** When implementation completes, then runnable tests/typechecks/build, reproducible manual QA steps, and before/after screenshots are provided. Any uncompleted P0 or P1 criterion must be explicitly reported, not implied done.

**A15 — themes:** Given light and dark mode, when user toggles theme, then workspace components consistently follow the selected tokens, interactive states remain readable, and the preference persists locally.

## 13. Definition of Done

- All P0 and P1 behaviors implemented; P2 optional and labeled.
- Usability is meaningfully improved, not just color changes.
- Multi-turn is demonstrated at the **HTTP boundary** (history actually reaches the model), not solely in local UI state.
- State transitions and proposal freshness covered by automated tests.
- No regression in deterministic editing and human review.
- A reader can explain what is committed vs. proposed vs. saved vs. published at any point.
