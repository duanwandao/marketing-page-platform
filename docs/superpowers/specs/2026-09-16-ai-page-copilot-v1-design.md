# AI Page Copilot v1 Design

## 1. Problem

The marketing page platform already supports:

* Schema-driven components
* Component registry
* Config-driven property editing
* Page persistence
* Draft saving
* Publish snapshots
* Published runtime rendering

The next milestone is to demonstrate an AI-native workflow suitable for an AI application / agent engineering portfolio.

The AI should not generate React source code.

It should understand a natural-language marketing request, inspect the capabilities exposed by the existing platform, use tools to construct a valid page proposal, and hand that proposal back to the deterministic builder.

The core architectural idea is:

```text
Natural-language intent
        ↓
       LLM
        ↓
   Tool Calling
        ↓
Platform capabilities
        ↓
Validated PageSchema proposal
        ↓
Human Apply
        ↓
EditorStore
        ↓
Existing deterministic Renderer
```

AI handles uncertain natural-language intent.

The existing platform continues to handle deterministic execution.

---

# 2. Goals

AI Page Copilot v1 must allow a user editing a page to enter a request such as:

> Create a Mid-Autumn promotion page with a festival banner, a coupon section, and recommended products.

The agent must be able to:

1. Inspect which components are available.
2. Inspect component definitions when necessary.
3. Inspect the current editable page.
4. Produce a structured page proposal.
5. Have that proposal validated by deterministic application code.
6. Receive validation errors as tool observations and retry when appropriate.
7. Return a valid `PageSchema` proposal to the Builder.
8. Show an execution trace containing tool calls and tool results.
9. Let the human explicitly Apply or Discard the proposal.
10. Keep normal Save and Publish semantics unchanged.

The feature must demonstrate a real:

```text
LLM
→ Tool Call
→ Tool Execution
→ Observation
→ LLM
```

loop.

---

# 3. Non-goals

Do not implement in v1:

* RAG
* Embeddings
* Vector database
* Component semantic retrieval
* Long-term agent memory
* Multi-agent systems
* Autonomous publishing
* AI-generated React source
* AI-generated arbitrary HTML
* Image generation
* Authentication
* Database persistence for conversations
* Multi-turn persisted chat history
* Streaming responses
* Drag & Drop
* Undo / Redo
* Template system

There are currently only a few components, so introducing RAG would be premature.

A future v2 may introduce:

```text
Component Retrieval
→ Vector Search / RAG
→ Candidate Components
→ Agent Tool Calling
```

when the component catalog becomes large enough to justify retrieval.

---

# 4. Architectural Principles

## 4.1 AI must not generate application code

Do not use:

```text
User
→ LLM
→ React / HTML code
```

Use:

```text
User
→ LLM
→ Structured component/page intent
→ deterministic PageSchema construction
→ existing Renderer
```

## 4.2 Validation must not be optional

Validation is not exposed as an optional tool that the model may choose to skip.

Whenever the model submits a page proposal, deterministic application code MUST validate and normalize it automatically.

The model receives validation failures as tool observations.

## 4.3 Human remains in control

A successful AI run returns a proposal.

It does not immediately mutate EditorStore.

The UI presents:

```text
AI proposal
↓
Apply to page
or
Discard
```

Only Apply modifies the current editor draft.

AI must never automatically Save or Publish.

## 4.4 Existing deterministic architecture remains authoritative

The AI layer does not replace:

* ComponentRegistry
* PageSchema
* EditorStore
* PageRepository
* PageRenderer

It operates through them.

---

# 5. Runtime Architecture

Add a small server-side application:

```text
apps/
├── builder
└── agent-server
```

The server exists primarily to:

* protect the model API key
* call the LLM provider
* execute the tool loop
* validate tool arguments
* return the proposal and execution trace

The Builder must never receive `AI_API_KEY`.

The browser must never call the LLM provider directly.

---

# 6. LLM Provider Boundary

Use an OpenAI-compatible tool-calling interface.

Environment configuration:

```text
AI_API_KEY
AI_BASE_URL
AI_MODEL
PORT
```

`AI_BASE_URL` and `AI_MODEL` must be configurable so the demo can use compatible providers without changing agent business logic.

The provider-specific client must be isolated behind a small adapter.

The rest of the agent logic must not depend directly on a specific vendor.

For maximum compatibility, v1 may use OpenAI-compatible Chat Completions tool calling.

If the chosen SDK causes compatibility problems with a configured provider, a native `fetch` adapter is acceptable as long as the provider boundary remains isolated.

---

# 7. Agent HTTP Contract

Expose:

```text
POST /api/agent
```

Request conceptually contains:

```ts
interface AgentRequest {
  instruction: string;
  currentPage: PageSchema;
  componentCatalog: AgentComponentDefinition[];
}
```

Response:

```ts
interface AgentResponse {
  message: string;
  proposedSchema: PageSchema | null;
  trace: AgentTraceEvent[];
}
```

Each request is independent in v1.

Do not persist conversation history.

Every new instruction receives the latest current draft from the editor.

---

# 8. Serializable Component Catalog

The AI must not receive React component implementations.

The Builder converts ComponentRegistry definitions into serializable metadata.

Conceptually:

```ts
interface AgentComponentDefinition {
  type: string;
  name: string;
  defaultProps: Record<string, unknown>;
  configSchema: ConfigField[];
}
```

Given an existing ComponentDefinition:

```text
ComponentDefinition
├── type
├── name
├── component        ← DO NOT send to agent
├── defaultProps
└── configSchema
```

the agent receives only:

```text
type
name
defaultProps
configSchema
```

This preserves the existing component boundary.

---

# 9. Agent Tools

Expose exactly these v1 tools to the model.

## Tool 1: list_components

Purpose:

Discover available platform capabilities.

Input:

```json
{}
```

Output conceptually:

```json
[
  {
    "type": "Banner",
    "name": "Banner"
  },
  {
    "type": "Coupon",
    "name": "Coupon"
  }
]
```

Do not dump full component metadata here.

---

## Tool 2: get_component_definition

Purpose:

Inspect one known component before using it.

Input:

```json
{
  "type": "Banner"
}
```

Output:

```text
type
name
defaultProps
configSchema
```

Unknown component types return a structured tool error.

---

## Tool 3: get_current_page

Purpose:

Allow modification requests to understand the existing page.

Input:

```json
{}
```

Output:

the current editable `PageSchema` supplied with the request.

---

## Tool 4: submit_page_layout

Purpose:

Submit the proposed page configuration.

The model should submit a constrained layout rather than arbitrary React code.

Conceptual arguments:

```ts
interface SubmitPageLayoutInput {
  title?: string;
  components: Array<{
    type: string;
    props?: Record<string, unknown>;
  }>;
}
```

The model DOES NOT control:

* page id
* schemaVersion
* persistence
* publication state

The tool executor constructs the actual PageSchema.

---

# 10. Deterministic Page Construction

`submit_page_layout` must perform deterministic normalization.

Given:

```json
{
  "type": "Coupon",
  "props": {
    "title": "Mid-Autumn Coupon",
    "amount": 30
  }
}
```

the tool executor:

1. Finds the component definition.
2. Clones its `defaultProps`.
3. Applies allowed configurable values.
4. Validates their types.
5. Generates a component id.
6. Creates the ComponentSchema.

For every component:

```text
final props
=
defaultProps
+
validated configurable overrides
```

This is important because some existing component props are not exposed through `configSchema`.

For example a component may have useful default data that should be preserved even if the model only edits its title.

The model may only override keys declared in `configSchema`.

Unknown prop keys must return validation errors rather than silently entering PageSchema.

---

# 11. ConfigField Validation

Validate overrides according to existing config field types.

At minimum:

```text
text   → string
image  → string
color  → string
number → number
switch → boolean
```

Unknown component types fail validation.

Unknown configurable property keys fail validation.

Incorrect value types fail validation.

Duplicate generated ids must never occur.

The resulting schema must preserve:

```text
schema.id === currentPage.id
schema.schemaVersion === currentPage.schemaVersion
```

The page title defaults to the existing title unless the proposal explicitly supplies a new one.

---

# 12. Tool Error / Repair Loop

If `submit_page_layout` receives invalid data:

```text
LLM
↓
submit_page_layout
↓
deterministic validation fails
↓
tool result:
{
  success: false,
  errors: [...]
}
↓
LLM receives Observation
↓
LLM may repair and call again
```

The server must impose a finite maximum number of model/tool iterations.

Recommended v1 maximum:

```text
8
```

If the maximum is exceeded, return a clear agent error.

Do not allow infinite autonomous loops.

---

# 13. Successful Agent Completion

A run is considered successful only when a valid proposal has been created through `submit_page_layout`.

The server then returns:

```text
assistant message
+
proposedSchema
+
execution trace
```

If the model finishes without submitting a valid layout, return no proposal and explain the failure.

---

# 14. Execution Trace

The Builder must expose a collapsible Execution Trace.

Trace events should represent observable agent actions such as:

```text
list_components
→ returned 4 components

get_component_definition
→ Banner definition

get_component_definition
→ Coupon definition

submit_page_layout
→ validation failed: Coupon.amount must be number

submit_page_layout
→ proposal accepted
```

The trace is for:

* debugging
* demonstrating tool calling
* interview explanation
* observability

Do NOT expose:

* hidden chain of thought
* system prompt
* provider secrets
* API key
* internal reasoning tokens

Store only sanitized tool names, arguments, result summaries and errors.

---

# 15. Builder UI

Add an AI Copilot panel to the editor.

Minimum UI:

```text
AI Copilot
────────────────

[ user instruction textarea ]

[ Generate ]

Assistant result

[ Apply to page ]
[ Discard ]

▶ Execution Trace
```

During execution:

```text
Generate
→ Running…
```

Errors should be shown locally in the panel.

The rest of the editor remains usable after failures.

No elaborate chat UI is required.

---

# 16. Applying a Proposal

Add an EditorStore action conceptually equivalent to:

```ts
replacePageSchema(schema: PageSchema): void
```

Applying an AI proposal must:

* replace the current editable draft
* preserve the current page identity
* clear component selection if necessary
* increment editor revision
* therefore mark the editor as having unsaved changes

It must NOT:

* call PageRepository
* Save automatically
* Publish automatically

Therefore:

```text
AI proposal
↓
Apply
↓
EditorStore draft changes
↓
Unsaved changes
↓
human Save
↓
human Publish
```

Existing draft/published semantics remain unchanged.

---

# 17. Preview and Publish Semantics

AI works only against the editable draft.

After Apply:

```text
Editor Preview
→ new AI-modified draft
```

but:

```text
Published Runtime
→ previous publishedSchema
```

until the human clicks Publish.

This behavior must be covered by tests or existing lifecycle behavior must remain demonstrably unchanged.

---

# 18. Server State

The agent server should be stateless in v1.

Request-local agent state contains:

```text
instruction
currentPage
componentCatalog
candidate proposal
execution trace
```

Do not add:

* database
* Redis
* conversation persistence
* session storage

---

# 19. Development Networking

During local development:

```text
Builder
→ /api/agent
→ agent-server
```

Prefer a Vite development proxy or similarly simple same-origin development setup.

Avoid CORS complexity when possible.

Root development commands should make it straightforward to start both the Builder and Agent Server.

---

# 20. Security

Required:

* API key only on server.
* `.env` ignored.
* `.env.example` contains names only, never a real secret.
* Do not log API keys.
* Do not return provider credentials to client.
* Do not expose raw environment configuration through an endpoint.
* Validate HTTP request bodies.
* Validate tool arguments.
* Set a reasonable request/body size limit if the chosen server framework makes this straightforward.

---

# 21. Error Handling

Handle at least:

* missing server AI configuration
* provider request failure
* malformed model tool arguments
* unknown tool calls
* unknown component type
* invalid configurable prop
* incorrect prop value type
* max tool iteration exceeded
* invalid HTTP request
* proposal generation without a valid final layout

Errors returned to the Builder should be understandable but should not leak secrets or unnecessary provider internals.

---

# 22. Testing Strategy

Do not use a real paid model API in automated tests.

The model/provider boundary must be fakeable.

At minimum test:

## Agent core / tools

* `list_components`
* known component definition
* unknown component definition
* current page retrieval
* proposal preserves page id and schemaVersion
* default props are preserved
* configurable overrides are applied
* unknown prop is rejected
* incorrect field type is rejected
* unknown component is rejected

## Tool loop

Using a fake model adapter:

* model calls list_components
* tool result returns to model
* model requests definition
* model submits valid layout
* final response contains proposedSchema
* invalid submission becomes an observation and can be repaired
* maximum step count terminates the loop

## Builder

* component registry serializes without React component functions
* AI panel submits current PageSchema and component catalog
* successful proposal is shown without changing editor immediately
* Discard leaves editor unchanged
* Apply replaces the draft
* Apply increments revision / creates Unsaved changes
* AI Apply does not Save
* AI Apply does not Publish
* trace renders tool events

No test should require an external AI provider.

---

# 23. Documentation

Update README and architecture documentation after implementation.

README should include:

* what AI Copilot does
* how to configure environment
* how to run Builder + agent-server
* one example prompt
* short explanation of Tool Calling
* statement that RAG is intentionally not used yet because the component catalog is small

Architecture docs should show:

```text
Builder
  ↓
Agent API
  ↓
LLM
  ↕
Tool Loop
  ↓
Validated proposal
  ↓
Human Apply
  ↓
EditorStore
  ↓
PageSchema
```

and preserve the existing Draft / Publish architecture.

---

# 24. Demo Scenario

The finished demo must support this walkthrough:

1. Create a page.

2. Open Builder.

3. Open AI Copilot.

4. Enter:

   `Create a Mid-Autumn promotion page with a festive banner, a coupon, and a recommended product section.`

5. Observe Execution Trace showing tool calls.

6. Receive a valid page proposal.

7. Click Apply.

8. Canvas updates with platform components.

9. Editor shows Unsaved changes.

10. Manually adjust one property through PropertyPanel.

11. Click Save.

12. Click Publish.

13. Open Published Page.

14. Published Runtime renders through the existing PageRenderer.

This is the primary acceptance scenario for interviews.

---

# 25. Acceptance Criteria

AI Page Copilot v1 is complete when all of the following are true:

* Natural language can generate a valid page proposal.
* The LLM uses actual tool calls.
* Tool calls receive real execution results.
* Invalid proposals can be returned as observations and repaired.
* AI outputs structured platform data rather than React source.
* API credentials remain server-side.
* Execution Trace is visible.
* Proposal is not applied automatically.
* Apply modifies only the editor draft.
* Apply makes the page dirty.
* Save and Publish remain human-controlled.
* Published Runtime still renders only publishedSchema.
* No RAG/vector database is introduced.
* Automated tests use a fake model provider.
* Existing tests remain passing.
* `pnpm test` passes.
* `pnpm typecheck` passes.
* `pnpm build` passes.
