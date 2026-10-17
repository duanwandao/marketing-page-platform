import { beforeEach, describe, expect, it } from "vitest";
import { useCopilotSessionStore } from "./copilot-session-store";

const page = { schemaVersion: 1 as const, id: "page-store", title: "Draft", components: [] };
describe("Copilot session storage", () => {
  beforeEach(() => { localStorage.clear(); useCopilotSessionStore.setState({ sessions: {} }); });
  it("isolates sessions by page and bounds persisted conversation size", () => {
    const store = useCopilotSessionStore.getState();
    store.ensureSession("page-store", page);
    store.ensureSession("page-other", { ...page, id: "page-other" });
    useCopilotSessionStore.getState().updateSession("page-store", (session) => ({ ...session, messages: Array.from({ length: 70 }, (_, index) => ({ id: String(index), role: "user" as const, content: "x".repeat(4000) })) }));
    expect(useCopilotSessionStore.getState().sessions["page-other"].messages).toHaveLength(0);
    const saved = JSON.parse(localStorage.getItem("mpp:copilot:v2:page-store") ?? "{}") as { messages: Array<{ content: string }> };
    expect(saved.messages).toHaveLength(50);
    expect(saved.messages[0].content).toHaveLength(3000);
  });
  it("falls back safely from corrupt local data", () => {
    localStorage.setItem("mpp:copilot:v2:page-store", "not-json");
    useCopilotSessionStore.getState().ensureSession("page-store", page);
    expect(useCopilotSessionStore.getState().sessions["page-store"].messages).toEqual([]);
  });
});
