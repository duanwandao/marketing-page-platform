# AI Copilot Multi-turn Editing

## Status

Implemented on 2026-10-15 following approval of the revised spec and plan.

## Date

2026-10-13

---

# Background

The current AI Copilot can generate a complete marketing page from a natural language instruction.

The current workflow is:

User instruction → Agent → Generate PageSchema → Human Apply

This works well for creating a new page, but it has limitations for interactive editing.

A real page building workflow is iterative. Users usually create a page first and then continuously refine it.

Examples:

- "Make the banner title shorter."
- "Increase the coupon amount to 50."
- "Remove the product recommendation section."
- "Add a text section below the coupon."

The current implementation generates a new complete page proposal instead of making targeted changes to the existing page.

This feature introduces multi-turn editing capabilities so that AI Copilot can act as an interactive page editing assistant.

---

# Problem Statement

The AI Copilot should support incremental page modifications.

The Agent should:

- Understand the current page state.
- Identify the smallest required change.
- Use dedicated tools to modify the page.
- Validate all modifications before applying them.
- Keep the user in control through the existing Apply workflow.

The Agent should not directly mutate the editor state.

---

# Goals

## Goal 1: Modify existing components

Users should be able to modify properties of existing components through natural language.

Example:

User:

```
Change the coupon amount to 50.
```

Expected behavior:

The Agent identifies the existing Coupon component and updates only the amount property.

The following should remain unchanged:

- component id
- component type
- unrelated properties

---

## Goal 2: Add new components

Users should be able to add components through natural language.

Example:

User:

```
Add a banner at the top.
```

Expected behavior:

The Agent creates a new Banner component using the component definition available in the system.

---

## Goal 3: Remove existing components

Users should be able to remove components through natural language.

Example:

User:

```
Remove the product list.
```

Expected behavior:

The Agent removes the corresponding component from the page.

---

## Goal 4: Preserve page integrity

AI-generated modifications must preserve the validity of PageSchema.

The system must ensure:

- Component types are valid.
- Component properties are valid.
- Property values match expected types.
- Existing unrelated page data is preserved.

---

## Goal 5: Support multi-turn conversations

Each new request uses the current editor draft supplied by the client. A proposal becomes the input to the next request only after the user applies it. There is no cross-request conversation history or server session persistence in this version.

Within one request, the Agent maintains model messages and tool observations, and successful tool operations accumulate in a private working draft.

Example:

```
Create a promotion page.

↓

Change the banner title.

↓

Increase coupon discount.

↓

Remove products.
```

Each request builds upon the latest applied page state, including manual editor changes. Discarded and pending proposals are not used as the base of another request. Follow-up instructions must identify their target from that page; conversation-only references are outside this version.

---

# Non Goals

This feature does not include:

- Drag and drop functionality.
- Visual layout optimization.
- Automatic publishing.
- User authentication.
- Database persistence changes.
- RAG based component retrieval.
- Multi-agent workflows.

---

# User Experience

The user workflow should remain:

```
User request

↓

AI generates proposal

↓

User reviews proposal

↓

User applies proposal

↓

Editor state updates
```

The AI should assist editing but should not automatically change the page.

---

# Functional Requirements

## Component Update

The system should support updating existing component properties.

Example request:

```
Change the coupon amount to 50.
```

The resulting modification should only affect:

```
Coupon.amount
```

and should preserve other properties.

---

## Component Addition

The system should support adding components.

Example request:

```
Add a banner component.
```

The added component should:

- Exist in the component registry.
- Use valid default properties.
- Pass validation.

---

## Component Removal

The system should support removing components.

Example request:

```
Remove the product list.
```

The removed component should no longer exist in the proposed page schema.

---

# Validation Requirements

All AI generated modifications must be validated before they are accepted.

Validation should detect:

## Invalid Component

Example:

```
UnknownComponent
```

The system should reject it.

---

## Invalid Property

Example:

A component does not support:

```
unknownField
```

The system should reject it.

---

## Invalid Property Type

Example:

Coupon amount expects a number.

Invalid:

```json
{
  "amount": "50"
}
```

Valid:

```json
{
  "amount": 50
}
```

The system should reject invalid types.

---

# Agent Behavior Requirements

The Agent should prefer small modifications.

For example:

User:

```
Change the coupon amount to 50.
```

The Agent should perform a targeted update.

The Agent should avoid generating a completely new page unless the user explicitly requests a new page.

---

# Error Recovery

When a tool rejects an operation, the Agent should use the returned validation feedback.

Example:

First attempt:

```
amount: "50"
```

Tool response:

```
amount must be a number
```

The Agent should repair the request:

```
amount: 50
```

and retry.

---

# Acceptance Criteria

## Scenario 1: Update component property

Given:

A page contains:

```
Coupon component
amount = 20
```

When:

```
Change coupon amount to 50.
```

Then:

The resulting page contains:

```
Coupon component
amount = 50
```

and unrelated properties remain unchanged.

---

## Scenario 2: Add component

Given:

A page without Banner component.

When:

```
Add a banner.
```

Then:

The proposed page contains a valid Banner component.

---

## Scenario 3: Remove component

Given:

A page contains ProductList.

When:

```
Remove product list.
```

Then:

The proposed page no longer contains ProductList.

---

## Scenario 4: Invalid modification recovery

Given:

Coupon amount requires a number.

When:

The Agent initially produces:

```
amount: "50"
```

Then:

The validation system rejects it.

The Agent should receive the error and produce:

```
amount: 50
```

---

# Testing Requirements

The implementation should include tests covering:

## Tool behavior

- Successful component update.
- Invalid component update.
- Invalid property update.
- Invalid property type.
- Successful component addition.
- Successful component removal.

## Agent behavior

- Multi-turn editing flow.
- Validation error recovery.
- Correct usage of tools.
- Preservation of previous context.

## UI behavior

- Proposal is not automatically applied.
- Apply updates editor state.
- Discard keeps the original page unchanged.

---

# Success Criteria

After this feature is completed:

The AI Copilot should behave like an interactive page editing assistant instead of a one-shot page generator.

The implementation should demonstrate:

- Agent tool design.
- Stateful interaction.
- Deterministic validation.
- Human-in-the-loop AI workflow.
- Reliable AI application architecture.


# Repository Architecture and Operation Contract

## Existing boundaries

- `packages/schema` owns serializable request, response, page, and change types.
- `apps/agent-server/src/provider.ts` exposes tool schemas to the model.
- `apps/agent-server/src/tools.ts` handles tool execution and observations.
- `apps/agent-server/src/agent.ts` retains model messages only for one `runAgent` call.
- `apps/builder/src/editor/copilot/CopilotPanel.tsx` sends the editor snapshot and component catalog on every request and applies proposals through `replacePageSchema`.
- The server uses the serializable catalog sent by the builder. Component registry authority is relative to that supplied catalog, as in the existing local demo; this feature does not add a server registry or authentication boundary.

## Structured operations

`PageChange` is a discriminated union with the following wire format:

```ts
type PageChange =
  | {
      operation: "update_component";
      componentId: string;
      props: Record<string, unknown>;
    }
  | {
      operation: "add_component";
      component: { type: string; props?: Record<string, unknown> };
      beforeComponentId?: string;
    }
  | {
      operation: "remove_component";
      componentId: string;
    };
```

The tool accepts `{ changes: PageChange[] }`. Require a nonempty array, reject unsupported operations and unexpected operation fields, and validate values at runtime rather than relying on TypeScript or provider JSON Schema alone. Component IDs and insertion anchors must be nonempty strings.

### Update

The target must exist exactly once. Keep its ID, type, position, and existing properties; shallow merge only the provided configurable properties. Require a nonempty patch. Deep object edits and property deletion are outside scope.

### Add

The type must exist in the catalog. Clone default props and merge valid configurable overrides. Generate the ID on the server using a type prefix and UUID, checking uniqueness against the working page. The model cannot supply an ID.

If `beforeComponentId` is absent, append the component. If present, insert immediately before that existing component; reject a missing anchor. To add at the top, use the first component as the anchor; on an empty page, append. To add immediately after a component, use its successor as the anchor, or append if the target is last.

### Remove

The target must exist exactly once. Remove only that component and keep the order and contents of all others. A missing ID is an error, including a second removal of the same ID in a batch.

## Validation boundaries

Separate validation from normalization:

- Validate model-provided props as a patch: keys must appear in the component's `configSchema`; `number` requires a finite number, `switch` a boolean, and `text`, `image`, and `color` a string.
- Merge defaults only when adding a component or building a complete replacement layout. Updating an existing component never reapplies defaults.
- Validate full pages for version 1, nonempty page/component IDs, a string title, a component array, unique component IDs, known component types, and object props.
- Full-page props may include keys declared by `defaultProps` or `configSchema`. This preserves `ProductList.products`, which is default data but not configurable. Reject other unknown keys. Check configurable field types and require keys declared by `defaultProps` to remain present.
- Existing nonconfigurable props are preserved without deep validation. This catalog cannot express nested product schemas, number ranges, color syntax, or URL rules. The feature does not claim those checks.

Both `submit_page_layout` and `apply_page_changes` use the shared rules. A complete replacement keeps the page ID and schema version, and uses the current working title unless a new title is supplied. Replacing the layout may replace component IDs; incremental edits preserve existing IDs.

## Working draft and atomicity

Each tool executor owns a cloned working page initialized from the request. `get_current_page` returns a clone of that page.

For `apply_page_changes`, apply operations in array order to a private candidate, then validate the result. A successful batch becomes the working draft and returns its full schema as the proposal. A failing batch leaves the working draft unchanged, even if earlier operations succeeded. Return errors with operation index and field/target details for model repair.

A successful `submit_page_layout` also replaces the request-local working draft. Reading or failing a tool must not mutate either the input request or the draft. Return successful proposal observations with the resulting page so the model can refer to server-generated IDs in a later batch.

The latest successful proposal is returned when the Agent finishes normally. Preserve the existing rule that iteration exhaustion returns no proposal. Failures return observations within the existing eight-iteration limit; no unbounded retry is introduced.

## Target ambiguity and Agent behavior

The prompt instructs the Agent to read the working page before editing, target exact component IDs, and use minimal changes. Complete layout replacement is reserved for explicit page creation/replacement requests.

If an instruction matches multiple components and page context cannot select one, return a clarification message and no proposal. The tool itself does not resolve natural-language targets or choose the first matching type. The response's existing `message` field can carry clarification; no persistent chat UI is added.

## Proposal lifecycle

Retain Apply / Discard and existing revision, page ID, and schema version checks. Manual changes during generation invalidate the result; manual changes after generation block Apply. Applying a proposal marks the editor dirty without saving or publishing it.

Update Copilot wording to describe generating or editing a page proposal. A new request replaces the displayed pending proposal and uses the editor snapshot, not that pending proposal. No preview/diff subsystem is added.

# Additional Acceptance and Test Cases

- Apply a generated page, update Coupon amount from 20 to 50 in another request, Apply it, then remove ProductList in a third request. Verify preservation of page identity and every unrelated component/property.
- Discard a proposal, submit another request, and verify it receives the original editor page. Submit another request while a proposal is pending and verify the same rule.
- In one Agent request, add a component, read the page, then update that generated component ID. Verify the final proposal includes both operations.
- Apply a batch whose later operation fails. Verify the source page and working draft remain unchanged, then retry with corrected input.
- Add before the first component, between components, and at the end. Reject a missing insertion anchor and keep IDs unique.
- Reject unknown operations, extra fields, empty changes/patches, unknown component IDs, duplicate page component IDs, unknown props, and nonfinite/wrong-type numbers.
- Preserve nonconfigurable `ProductList.products` while updating its title. Reject a model patch attempting to edit `products`.
- For ambiguous targets, verify the Agent receives explicit clarification guidance and that a scripted clarification response returns no proposal. Actual model compliance remains subject to a manual provider check.
- Retain tests for generation-time and Apply-time stale proposals, validation recovery, successful complete layout generation, trace redaction, and eight-iteration exhaustion.
