import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentRequest, AgentResponse } from "@mpp/schema";
import { useEditorStore } from "../store/editor-store";
import { AgentApiError } from "./agent-client";
import { CopilotPanel } from "./CopilotPanel";
import { registerBuiltinComponents } from "@mpp/components";
import { runAgent } from "../../../../agent-server/src/agent";

const proposal = { schemaVersion: 1 as const, id: "page-1", title: "AI page", components: [] };
const response: AgentResponse = { message: "Proposal ready.", proposedSchema: proposal, trace: [{ toolName: "list_components", arguments: {}, outcome: "success", summary: "0 components available" }] };

describe("CopilotPanel", () => {
  afterEach(cleanup);
  beforeEach(() => useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-1", title: "Draft", components: [] }));
  it("keeps a proposal out of the editor until Apply and then makes it dirty", async () => {
    render(<CopilotPanel requestAgent={async () => response} />);
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByText("Proposal ready.");
    expect(useEditorStore.getState().pageSchema?.title).toBe("Draft");
    fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
    expect(useEditorStore.getState().pageSchema).toEqual(proposal);
    expect(useEditorStore.getState().revision).toBe(1);
  });
  it("discards a proposal without altering the draft", async () => {
    render(<CopilotPanel requestAgent={async () => response} />);
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByText("Proposal ready.");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(useEditorStore.getState().pageSchema?.title).toBe("Draft");
  });

  it("discards a stale proposal when the page changes while generation is in progress", async () => {
    let finish!: (value: AgentResponse) => void;
    const pending = new Promise<AgentResponse>((resolve) => { finish = resolve; });
    render(<CopilotPanel requestAgent={() => pending} />);
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    useEditorStore.getState().updatePageTitle("Newer local edit");
    finish(response);
    expect(await screen.findByRole("alert")).toHaveTextContent("page changed while the proposal was generating");
    expect(screen.queryByRole("button", { name: "Apply to page" })).not.toBeInTheDocument();
    expect(useEditorStore.getState().pageSchema?.title).toBe("Newer local edit");
  });

  it.each([
    ["configuration", "AI configuration is missing"],
    ["authentication", "provider rejected the API credentials"],
    ["rate_limit", "rate limit or quota"],
    ["connection", "Could not connect to the AI service"],
    ["tool_call_format", "incompatible tool-calling format"]
  ])("explains %s failures in the Copilot panel", async (category, message) => {
    render(<CopilotPanel requestAgent={async () => { throw new AgentApiError(category, 502, "generic failure"); }} />);
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});


describe("Copilot multi-request lifecycle", () => {
  afterEach(cleanup);
  beforeEach(() => useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-1", title: "Draft", components: [] }));

  function generate(instruction: string) {
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: instruction } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
  }

  it("uses each applied draft across create, update and remove requests", async () => {
    registerBuiltinComponents();
    const received: AgentRequest[] = [];
    render(<CopilotPanel requestAgent={async (payload) => {
      received.push(structuredClone(payload));
      let turn = 0;
      return runAgent({ request: payload, model: {
        async complete() {
          turn += 1;
          if (turn === 1) return { toolCalls: [{ id: "read", name: "get_current_page", arguments: "{}" }] };
          if (turn > 2) return { content: `Ready: ${payload.instruction}` };
          const name = payload.instruction === "Create promotion" ? "submit_page_layout" : "apply_page_changes";
          const args = payload.instruction === "Create promotion"
            ? { components: [{ type: "Coupon", props: { title: "Special", amount: 20, threshold: 80 } }, { type: "ProductList", props: { title: "Recommended" } }] }
            : { changes: [payload.instruction === "Set coupon to 50"
              ? { operation: "update_component", componentId: "coupon-1", props: { amount: 50 } }
              : { operation: "remove_component", componentId: "productlist-2" }] };
          return { toolCalls: [{ id: "proposal", name, arguments: JSON.stringify(args) }] };
        }
      } });
    }} />);
    generate("Create promotion");
    await screen.findByText("Ready: Create promotion");
    expect(useEditorStore.getState().pageSchema?.components).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
    const created = structuredClone(useEditorStore.getState().pageSchema!);
    expect(created.components.map((c) => c.id)).toEqual(["coupon-1", "productlist-2"]);

    generate("Set coupon to 50");
    await screen.findByText("Ready: Set coupon to 50");
    expect(received[1].currentPage).toEqual(created);
    expect(useEditorStore.getState().pageSchema).toEqual(created);
    fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
    const updated = structuredClone(useEditorStore.getState().pageSchema!);
    expect(updated).toEqual({ ...created, components: [
      { id: "coupon-1", type: "Coupon", props: { title: "Special", amount: 50, threshold: 80 } }, created.components[1]
    ] });

    generate("Remove products");
    await screen.findByText("Ready: Remove products");
    expect(received[2].currentPage).toEqual(updated);
    expect(useEditorStore.getState().pageSchema).toEqual(updated);
    fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
    expect(useEditorStore.getState().pageSchema).toEqual({ ...updated, components: [updated.components[0]] });
    expect(useEditorStore.getState().revision).toBe(3);
    expect(useEditorStore.getState().lastSavedRevision).toBe(0);
  });

  it.each([true, false])("starts from the editor when a previous proposal was discarded=%s", async (discard) => {
    const received: AgentRequest[] = [];
    render(<CopilotPanel requestAgent={async (payload) => {
      received.push(structuredClone(payload));
      return { ...response, message: `Proposal ${received.length}` };
    }} />);
    generate("First");
    await screen.findByText("Proposal 1");
    if (discard) fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    generate("Second");
    await screen.findByText("Proposal 2");
    expect(received[1].currentPage).toEqual({ schemaVersion: 1, id: "page-1", title: "Draft", components: [] });
    expect(screen.queryByText("Proposal 1")).not.toBeInTheDocument();
    expect(useEditorStore.getState().revision).toBe(0);
  });

  it("shows a clarification with no Apply action", async () => {
    render(<CopilotPanel requestAgent={async () => ({ message: "Which coupon should I update?", proposedSchema: null, trace: [] })} />);
    generate("Update coupon");
    await screen.findByText("Which coupon should I update?");
    expect(screen.queryByRole("button", { name: "Apply to page" })).not.toBeInTheDocument();
  });

  it("blocks Apply when the editor changes after generation", async () => {
    render(<CopilotPanel requestAgent={async () => response} />);
    generate("Make a page");
    await screen.findByText("Proposal ready.");
    act(() => useEditorStore.getState().updatePageTitle("Local change"));
    await waitFor(() => expect(screen.getByRole("button", { name: "Apply to page" })).toBeDisabled());
    fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
    expect(useEditorStore.getState().pageSchema?.title).toBe("Local change");
  });
});
