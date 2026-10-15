import { describe, expect, it } from "vitest";
import { agentToolNames, type AgentResponse } from "./agent";

describe("agent contracts", () => {
  it("represents a proposal and sanitized trace without executable component data", () => {
    const response: AgentResponse = {
      message: "Proposal ready.",
      proposedSchema: null,
      trace: [
        {
          toolName: "list_components",
          arguments: {},
          outcome: "success",
          summary: "4 components available"
        }
      ]
    };

    expect(response.trace[0].toolName).toBe("list_components");
    expect(agentToolNames).toEqual([
      "list_components",
      "get_component_definition",
      "get_current_page",
      "submit_page_layout",
      "apply_page_changes"
    ]);
  });
});
