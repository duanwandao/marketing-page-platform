import { useState } from "react";
import { componentRegistry } from "@mpp/component-registry";
import type { AgentRequest, AgentResponse } from "@mpp/schema";
import { useEditorStore } from "../store/editor-store";
import { AgentApiError, requestAgent as defaultRequestAgent } from "./agent-client";
import { serializeComponentCatalog } from "./component-catalog";
import "./copilot.css";

type RequestAgent = (payload: AgentRequest) => Promise<AgentResponse>;

function describeError(cause: unknown): string {
  if (!(cause instanceof AgentApiError)) return cause instanceof Error ? cause.message : "Unable to generate proposal.";
  switch (cause.category) {
    case "configuration": return "AI configuration is missing. Add AI_API_KEY and AI_MODEL to the project root .env, then restart the server.";
    case "authentication": return "The provider rejected the API credentials. Check AI_API_KEY and account permissions.";
    case "rate_limit": return "The provider rate limit or quota has been reached. Check your quota and try again.";
    case "connection": return "Could not connect to the AI service. Check that agent-server is running, AI_BASE_URL is correct, and your network is available.";
    case "tool_call_format": return "The provider returned an incompatible tool-calling format. Check that AI_MODEL supports OpenAI-compatible tool calling.";
    default: return cause.message || `The AI request failed (HTTP ${cause.status}). Check provider settings and status.`;
  }
}

export function CopilotPanel({ requestAgent = defaultRequestAgent }: { requestAgent?: RequestAgent }) {
  const pageSchema = useEditorStore((state) => state.pageSchema);
  const revision = useEditorStore((state) => state.revision);
  const replacePageSchema = useEditorStore((state) => state.replacePageSchema);
  const [instruction, setInstruction] = useState("");
  const [response, setResponse] = useState<AgentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [proposalRevision, setProposalRevision] = useState<number | null>(null);

  async function generate() {
    if (!pageSchema || !instruction.trim()) return;
    const draftAtStart = structuredClone(pageSchema);
    const revisionAtStart = useEditorStore.getState().revision;
    setRunning(true);
    setError(null);
    setResponse(null);
    setProposalRevision(null);
    try {
      const result = await requestAgent({ instruction, currentPage: draftAtStart, componentCatalog: serializeComponentCatalog(componentRegistry) });
      const latest = useEditorStore.getState();
      if (latest.revision !== revisionAtStart || latest.pageSchema?.id !== draftAtStart.id) {
        setError("The page changed while the proposal was generating. The outdated proposal was discarded; generate again to use the latest draft.");
        return;
      }
      setResponse(result);
      setProposalRevision(revisionAtStart);
    } catch (cause) {
      setError(describeError(cause));
    } finally {
      setRunning(false);
    }
  }

  function apply() {
    const current = useEditorStore.getState();
    if (!response?.proposedSchema || !current.pageSchema || proposalRevision !== current.revision || response.proposedSchema.id !== current.pageSchema.id || response.proposedSchema.schemaVersion !== current.pageSchema.schemaVersion) {
      setResponse(null);
      setError("The page changed after this proposal was generated. Generate a fresh proposal before applying.");
      return;
    }
    replacePageSchema(response.proposedSchema);
    setResponse(null);
    setProposalRevision(null);
  }

  function discard() {
    setResponse(null);
    setProposalRevision(null);
  }

  return (
    <section className="copilot-panel" aria-label="AI Copilot">
      <h2>AI Copilot</h2>
      <label htmlFor="copilot-instruction">Describe the page or change you want</label>
      <textarea id="copilot-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} />
      <p className="copilot-panel__hint">Generate a page or edit the current draft. Apply updates the draft; save and publish are separate actions.</p>
      <button className="copilot-panel__generate" type="button" disabled={running || !instruction.trim()} onClick={() => void generate()}>
        {running ? "Generating…" : "Generate"}
      </button>
      {running ? <p className="copilot-panel__loading" role="status">Generating a proposal…</p> : null}
      {error ? <p className="copilot-panel__error" role="alert">{error}</p> : null}
      {response ? <>
        <p className="copilot-panel__result" aria-live="polite">{response.message}</p>
        {response.proposedSchema ? <div className="copilot-panel__actions">
          <button type="button" disabled={proposalRevision !== revision} onClick={apply}>Apply to page</button>
          <button className="copilot-panel__secondary" type="button" onClick={discard}>Discard</button>
        </div> : null}
        <details className="copilot-panel__trace">
          <summary>Execution Trace ({response.trace.length})</summary>
          <ul>{response.trace.map((item, index) => <li key={`${item.toolName}-${index}`}><strong>{item.toolName} · {item.outcome === "error" ? "Error" : "Completed"}</strong><span>{item.summary}</span><code>{JSON.stringify(item.arguments, null, 2)}</code></li>)}</ul>
        </details>
      </> : null}
    </section>
  );
}
