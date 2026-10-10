import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { AgentResponse } from "@mpp/schema";
import { useEditorStore } from "../store/editor-store";
import { AgentApiError } from "./agent-client";
import { CopilotPanel } from "./CopilotPanel";

const proposal = { schemaVersion: 1 as const, id: "page-1", title: "AI page", components: [] };
const response: AgentResponse = { message: "Proposal ready.", proposedSchema: proposal, trace: [{ toolName: "list_components", arguments: {}, outcome: "success", summary: "0 components available" }] };

describe("CopilotPanel", () => {
  afterEach(cleanup);
  beforeEach(() => useEditorStore.getState().loadPage({ schemaVersion: 1, id: "page-1", title: "Draft", components: [] }));
  it("keeps a proposal out of the editor until Apply and then makes it dirty", async () => {
    render(<CopilotPanel requestAgent={async () => response} />);
    fireEvent.change(screen.getByLabelText("Describe the page you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByText("Proposal ready.");
    expect(useEditorStore.getState().pageSchema?.title).toBe("Draft");
    fireEvent.click(screen.getByRole("button", { name: "Apply to page" }));
    expect(useEditorStore.getState().pageSchema).toEqual(proposal);
    expect(useEditorStore.getState().revision).toBe(1);
  });
  it("discards a proposal without altering the draft", async () => {
    render(<CopilotPanel requestAgent={async () => response} />);
    fireEvent.change(screen.getByLabelText("Describe the page you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    await screen.findByText("Proposal ready.");
    fireEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(useEditorStore.getState().pageSchema?.title).toBe("Draft");
  });

  it("discards a stale proposal when the page changes while generation is in progress", async () => {
    let finish!: (value: AgentResponse) => void;
    const pending = new Promise<AgentResponse>((resolve) => { finish = resolve; });
    render(<CopilotPanel requestAgent={() => pending} />);
    fireEvent.change(screen.getByLabelText("Describe the page you want"), { target: { value: "Make a page" } });
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
    fireEvent.change(screen.getByLabelText("Describe the page you want"), { target: { value: "Make a page" } });
    fireEvent.click(screen.getByRole("button", { name: "Generate" }));
    expect(await screen.findByRole("alert")).toHaveTextContent(message);
  });
});
