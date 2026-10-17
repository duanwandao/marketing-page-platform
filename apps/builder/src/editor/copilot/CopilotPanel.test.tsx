import "@testing-library/jest-dom/vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentRequest, AgentResponse } from "@mpp/schema";
import { useEditorStore } from "../store/editor-store";
import { AgentApiError } from "./agent-client";
import { CopilotPanel } from "./CopilotPanel";
import { registerBuiltinComponents } from "@mpp/components";
import { runAgent } from "../../../../agent-server/src/agent";
import { useCopilotSessionStore } from "./copilot-session-store";

const proposal = { schemaVersion: 1 as const, id: "page-1", title: "AI page", components: [] };
const response: AgentResponse = { message: "Proposal ready.", proposedSchema: proposal, trace: [{ toolName: "list_components", arguments: {}, outcome: "success", summary: "0 components available" }] };

describe("CopilotPanel", () => {
  afterEach(cleanup);
  beforeEach(() => { localStorage.clear(); useCopilotSessionStore.setState({ sessions: {} }); useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-1", title: "Draft", components: [] }); });
  it("keeps a proposal out of the editor until Apply and then makes it dirty", async () => {
    render(<CopilotPanel requestAgent={async () => response} />);
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Proposal ready.");
    expect(useEditorStore.getState().pageSchema?.title).toBe("Draft");
    fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
    expect(useEditorStore.getState().pageSchema).toEqual(proposal);
    expect(useEditorStore.getState().revision).toBe(1);
  });
  it("discards a proposal without altering the draft", async () => {
    render(<CopilotPanel requestAgent={async () => response} />);
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    await screen.findByText("Proposal ready.");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(useEditorStore.getState().pageSchema?.title).toBe("Draft");
  });

  it("discards a stale proposal when the page changes while generation is in progress", async () => {
    let finish!: (value: AgentResponse) => void;
    const pending = new Promise<AgentResponse>((resolve) => { finish = resolve; });
    render(<CopilotPanel requestAgent={() => pending} />);
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
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
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});


describe("Copilot multi-request lifecycle", () => {
  afterEach(cleanup);
  beforeEach(() => { localStorage.clear(); useCopilotSessionStore.setState({ sessions: {} }); useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-1", title: "Draft", components: [] }); });

  function generate(instruction: string) {
    fireEvent.change(screen.getByLabelText("Describe the page or change you want"), { target: { value: instruction } });
    fireEvent.click(screen.getByRole("button", { name: "Send message" }));
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
    expect(received[1].currentPage).toEqual(discard ? { schemaVersion: 1, id: "page-1", title: "Draft", components: [] } : proposal);
    expect(screen.getAllByText("Proposal 2")).toHaveLength(1);
    expect(useEditorStore.getState().revision).toBe(0);
  });

  it("shows a clarification with no Apply action", async () => {
    useCopilotSessionStore.setState({ sessions: {} });
    useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-clarify", title: "Draft", components: [] });
    render(<CopilotPanel requestAgent={async () => ({ message: "Which coupon should I update?", proposedSchema: null, trace: [] })} />);
    generate("Update coupon");
    await screen.findByText("Which coupon should I update?");
    expect(screen.queryByRole("button", { name: "Apply to page" })).not.toBeInTheDocument();
  });

  it("blocks Apply when the editor changes after generation", async () => {
    useCopilotSessionStore.setState({ sessions: {} });
    useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-stale", title: "Draft", components: [] });
    render(<CopilotPanel requestAgent={async () => response} />);
    generate("Make a page");
    await screen.findByText("Proposal ready.");
    act(() => useEditorStore.getState().updatePageTitle("Local change"));
    await waitFor(() => expect(screen.getByText("Outdated · draft changed")).toBeInTheDocument());
    expect(screen.queryByRole("button", { name: "Apply to page" })).not.toBeInTheDocument();
    expect(useEditorStore.getState().pageSchema?.title).toBe("Local change");
  });

  it("refines a pending proposal from its candidate while preserving the accepted draft", async () => {
    useCopilotSessionStore.setState({ sessions: {} });
    useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-1", title: "Draft", components: [] });
    const candidate = { ...proposal, title: "First title" };
    const refined = { ...proposal, title: "Festive title" };
    const received: AgentRequest[] = [];
    render(<CopilotPanel requestAgent={async (payload) => { received.push(structuredClone(payload)); return { message: received.length === 1 ? "First proposal" : "Refined proposal", proposedSchema: received.length === 1 ? candidate : refined, trace: [] }; }} />);
    generate("Create a title");
    await screen.findByText("First proposal");
    generate("Make it festive");
    await screen.findByText("Refined proposal");
    expect(received[1].currentPage).toEqual(candidate);
    expect(received[1].workingCopyKind).toBe("pending_proposal");
    expect(useEditorStore.getState().pageSchema?.title).toBe("Draft");
    expect(screen.getByText("Page proposal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
    expect(useEditorStore.getState().pageSchema?.title).toBe("Festive title");
  });

  it("keeps the original pending proposal when refinement returns a clarification", async () => {
    useCopilotSessionStore.setState({ sessions: {} });
    useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-clarification", title: "Draft", components: [] });
    const candidate = { ...proposal, title: "Pending title" };
    let call = 0;
    render(<CopilotPanel requestAgent={async () => { call += 1; return call === 1 ? { message: "Original candidate", proposedSchema: candidate, trace: [] } : { message: "Which title should I use?", proposedSchema: null, trace: [] }; }} />);
    generate("Create a title");
    await screen.findByText("Original candidate");
    generate("Make it more playful");
    await screen.findByText("Which title should I use?");
    expect(screen.getByText("Page proposal")).toBeInTheDocument();
    expect(useEditorStore.getState().pageSchema?.title).toBe("Draft");
    expect(screen.getByRole("button", { name: "Apply to page" })).toBeEnabled();
  });

  it("restores a page-scoped conversation from local storage", async () => {
    useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-1", title: "Draft", components: [] });
    useCopilotSessionStore.setState({ sessions: {} });
    localStorage.setItem("mpp:copilot:v2:page-1", JSON.stringify({ messages: [{ id: "saved-1", role: "user", content: "Earlier request" }] }));
    render(<CopilotPanel requestAgent={async () => response} />);
    expect(await screen.findByText("Earlier request")).toBeInTheDocument();
  });

  it("sends only the bounded earlier user and assistant turns", async () => {
    const received: AgentRequest[] = [];
    render(<CopilotPanel requestAgent={async (payload) => { received.push(payload); return { message: "Clarify?", proposedSchema: null, trace: [] }; }} />);
    generate("first");
    await screen.findByText("Clarify?");
    generate("second");
    await waitFor(() => expect(received).toHaveLength(2));
    expect(received[1].history).toEqual([{ role: "user", content: "first" }, { role: "assistant", content: "Clarify?" }]);
  });

  it("marks an invalid pending proposal outdated after rehydrating a changed draft", () => {
    const base = { schemaVersion: 1 as const, id: "page-reload", title: "Base", components: [] };
    const changed = { ...base, title: "Manually changed" };
    const proposalSchema = { ...base, title: "Proposed" };
    localStorage.setItem("mpp:copilot:v2:page-reload", JSON.stringify({ messages: [{ id: "proposal-message", proposalId: "proposal-1", proposalState: "pending", role: "assistant", content: "Proposal" }], pending: { id: "proposal-1", pageId: "page-reload", baseRevision: 0, baseDraftSnapshot: base, proposedSchema: proposalSchema, messageId: "proposal-message", trace: [] } }));
    useCopilotSessionStore.setState({ sessions: {} });
    useCopilotSessionStore.getState().ensureSession("page-reload", changed);
    const session = useCopilotSessionStore.getState().sessions["page-reload"];
    expect(session.pending).toBeNull();
    expect(session.messages[0].proposalState).toBe("outdated");
  });
});
