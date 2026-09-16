import { useState } from "react";
import { componentRegistry } from "@mpp/component-registry";
import type { AgentRequest, AgentResponse } from "@mpp/schema";
import { useEditorStore } from "../store/editor-store";
import { requestAgent as defaultRequestAgent } from "./agent-client";
import { serializeComponentCatalog } from "./component-catalog";
import "./copilot.css";

export function CopilotPanel({ requestAgent = defaultRequestAgent }: { requestAgent?: (payload: AgentRequest) => Promise<AgentResponse> }) {
  const pageSchema = useEditorStore((state) => state.pageSchema);
  const replacePageSchema = useEditorStore((state) => state.replacePageSchema);
  const [instruction, setInstruction] = useState(""); const [response, setResponse] = useState<AgentResponse | null>(null); const [error, setError] = useState<string | null>(null); const [running, setRunning] = useState(false);
  async function generate() { if (!pageSchema || !instruction.trim()) return; setRunning(true); setError(null); try { setResponse(await requestAgent({ instruction, currentPage: structuredClone(pageSchema), componentCatalog: serializeComponentCatalog(componentRegistry) })); } catch (cause) { setError(cause instanceof Error ? cause.message : "Unable to generate proposal."); } finally { setRunning(false); } }
  function apply() { if (!response?.proposedSchema || !pageSchema || response.proposedSchema.id !== pageSchema.id || response.proposedSchema.schemaVersion !== pageSchema.schemaVersion) return; replacePageSchema(response.proposedSchema); setResponse(null); }
  return <section className="copilot-panel" aria-label="AI Copilot"><h2>AI Copilot</h2><label htmlFor="copilot-instruction">Describe the page you want</label><textarea id="copilot-instruction" value={instruction} onChange={(event) => setInstruction(event.target.value)} /><button type="button" disabled={running || !instruction.trim()} onClick={() => void generate()}>{running ? "Running…" : "Generate"}</button><div aria-live="polite" className="copilot-panel__result">{error ?? response?.message}</div>{response?.proposedSchema ? <div className="copilot-panel__actions"><button type="button" onClick={apply}>Apply to page</button><button type="button" onClick={() => setResponse(null)}>Discard</button></div> : null}{response ? <details><summary>Execution Trace</summary><ul>{response.trace.map((item, index) => <li key={`${item.toolName}-${index}`}>{item.toolName}: {item.summary}</li>)}</ul></details> : null}</section>;
}
