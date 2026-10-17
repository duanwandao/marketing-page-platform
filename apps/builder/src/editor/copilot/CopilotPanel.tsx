import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { componentRegistry } from "@mpp/component-registry";
import type { AgentRequest, AgentResponse } from "@mpp/schema";
import { useEditorStore } from "../store/editor-store";
import { AgentApiError, requestAgent as defaultRequestAgent } from "./agent-client";
import { serializeComponentCatalog } from "./component-catalog";
import { useCopilotSessionStore, type CopilotMessage } from "./copilot-session-store";
import { diffPageSchemas } from "./schema-diff";
import { Bot, CircleHelp, CornerDownLeft, PanelRightClose, Send, Sparkles, Trash2 } from "lucide-react";
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
  const ensureSession = useCopilotSessionStore((state) => state.ensureSession);
  const updateSession = useCopilotSessionStore((state) => state.updateSession);
  const clearSession = useCopilotSessionStore((state) => state.clearSession);
  const session = useCopilotSessionStore((state) => pageSchema ? state.sessions[pageSchema.id] : undefined);
  const messages = session?.messages ?? [];
  const pending = session?.pending ?? null;
  const [instruction, setInstruction] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [proposalBaseRevision, setProposalBaseRevision] = useState<number | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const requestId = useRef(0);
  const activePageId = useRef(pageSchema?.id);

  useEffect(() => {
    if (!pageSchema) return;
    ensureSession(pageSchema.id, pageSchema);
    if (activePageId.current !== pageSchema.id) {
      activePageId.current = pageSchema.id;
      requestId.current += 1;
      setRunning(false);
      setInstruction("");
      setError(null);
    }
    setProposalBaseRevision(null);
  }, [ensureSession, pageSchema?.id]);

  useEffect(() => { setInstruction(session?.composerDraft ?? ""); }, [pageSchema?.id]);

  useEffect(() => {
    if (pending && proposalBaseRevision === null) setProposalBaseRevision(pending.baseRevision);
  }, [pending?.id, proposalBaseRevision]);

  useEffect(() => {
    if (!pageSchema || !pending) return;
    if (pending.baseRevision !== revision || JSON.stringify(pending.baseDraftSnapshot) !== JSON.stringify(pageSchema)) {
      updateSession(pageSchema.id, (current) => ({ ...current, pending: null, messages: current.messages.map((message) => message.proposalId === pending.id ? { ...message, proposalState: "outdated" } : message) }));
      setProposalBaseRevision(null);
    }
  }, [pageSchema, revision, pending, updateSession]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  async function generate() {
    const text = instruction.trim();
    if (!pageSchema || !text || running) return;
    const sessionPageId = pageSchema.id;
    const draftAtStart = structuredClone(pageSchema);
    const revisionAtStart = useEditorStore.getState().revision;
    const priorHistory = messages.filter((message) => !message.status && message.proposalState !== "discarded" && message.proposalState !== "outdated").slice(-12).map(({ role, content }) => ({ role, content: content.slice(0, 1500) }));
    const userMessage: CopilotMessage = { id: crypto.randomUUID(), role: "user", content: text, status: "sending" };
    const assistantId = crypto.randomUUID();
    const token = ++requestId.current;
      updateSession(sessionPageId, (current) => ({ ...current, messages: [...current.messages, userMessage].slice(-50), composerDraft: "", requestStatus: "running", error: null }));
    setInstruction("");
    setRunning(true);
    setError(null);
    setProposalBaseRevision(null);
    try {
      const result = await requestAgent({ instruction: text, currentPage: pending?.proposedSchema ?? draftAtStart, componentCatalog: serializeComponentCatalog(componentRegistry), history: priorHistory, workingCopyKind: pending ? "pending_proposal" : "accepted_draft" });
      const latest = useEditorStore.getState();
      if (token !== requestId.current || latest.revision !== revisionAtStart || latest.pageSchema?.id !== sessionPageId) {
        const message = "The page changed while the proposal was generating. Generate again to use the latest draft.";
        setError(message);
        updateSession(sessionPageId, (current) => ({ ...current, messages: [...current.messages.map((item) => item.id === userMessage.id ? { ...item, status: "failed" as const } : item), { id: assistantId, role: "assistant", content: message }], requestStatus: "idle", error: message }));
        return;
      }
      const acceptedUnchanged = JSON.stringify(useEditorStore.getState().pageSchema) === JSON.stringify(draftAtStart);
      updateSession(sessionPageId, (current) => {
        const proposalId = crypto.randomUUID();
        const assistant: CopilotMessage = { id: assistantId, role: "assistant", content: result.message, ...(result.proposedSchema && acceptedUnchanged ? { proposalId, proposalState: "pending" as const } : {}) };
        const nextPending = result.proposedSchema && acceptedUnchanged ? { id: proposalId, pageId: sessionPageId, baseRevision: pending?.baseRevision ?? revisionAtStart, baseDraftSnapshot: pending?.baseDraftSnapshot ?? draftAtStart, proposedSchema: result.proposedSchema, messageId: assistantId, trace: result.trace } : pending;
        return { ...current, messages: [...current.messages.filter((message) => !result.proposedSchema || message.proposalState !== "pending").map((message) => message.id === userMessage.id ? { ...message, status: undefined } : message), assistant].slice(-50), requestStatus: "idle", error: null, pending: nextPending };
      });
      if (result.proposedSchema && acceptedUnchanged) setProposalBaseRevision(pending?.baseRevision ?? revisionAtStart);
    } catch (cause) {
      setError(describeError(cause));
      updateSession(sessionPageId, (current) => ({ ...current, messages: [...current.messages.map((message) => message.id === userMessage.id ? { ...message, status: "failed" as const } : message), { id: assistantId, role: "assistant", content: describeError(cause) }], requestStatus: "idle", error: describeError(cause) }));
    } finally { if (token === requestId.current) setRunning(false); }
  }

  function apply(message: CopilotMessage) {
    const current = useEditorStore.getState();
    const schema = pending?.proposedSchema;
    if (!schema || !current.pageSchema || pending?.baseRevision !== current.revision || JSON.stringify(pending.baseDraftSnapshot) !== JSON.stringify(current.pageSchema) || schema.id !== current.pageSchema.id || schema.schemaVersion !== current.pageSchema.schemaVersion) return;
    replacePageSchema(schema);
    updateSession(current.pageSchema.id, (session) => ({ ...session, messages: session.messages.map((item) => item.proposalId === message.proposalId ? { ...item, proposalState: "applied" } : item), pending: null }));
    setProposalBaseRevision(null);
  }

  function discard(message: CopilotMessage) {
    if (!pageSchema) return;
    updateSession(pageSchema.id, (session) => ({ ...session, messages: session.messages.map((item) => item.proposalId === message.proposalId ? { ...item, content: "Proposal discarded.", proposalState: "discarded" } : item), pending: null }));
    setProposalBaseRevision(null);
  }

  function submitOnEnter(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      void generate();
    }
  }

  return (
    <section className="copilot-panel" aria-label="AI Copilot">
      <header className="copilot-header"><div><span className="copilot-header__spark"><Sparkles aria-hidden="true" size={17} /></span><div><h2>AI Copilot</h2><p>Your creative partner for this page</p></div></div><div className="copilot-header__actions">{messages.length ? <button aria-label="Clear conversation" title="Clear conversation" onClick={() => setConfirmClear(true)} type="button"><Trash2 aria-hidden="true" size={15} /></button> : null}<button aria-label="Technical details" className="copilot-header__technical" type="button"><PanelRightClose aria-hidden="true" size={16} /></button></div></header>
      {confirmClear ? <div className="copilot-clear-confirm" role="alertdialog" aria-label="Clear conversation confirmation"><p>Clear this page’s saved conversation?</p><button onClick={() => { if (pageSchema) clearSession(pageSchema.id); setConfirmClear(false); setError(null); }} type="button">Clear conversation</button><button onClick={() => setConfirmClear(false)} type="button">Cancel</button></div> : null}
      <div className="copilot-conversation" ref={scrollRef} aria-label="Conversation" aria-live="polite">
        {messages.length === 0 ? <div className="copilot-empty"><span className="copilot-empty__orb"><Sparkles aria-hidden="true" size={21} /></span><h3>What are we creating?</h3><p>Describe a page or ask for a focused change. Your draft stays untouched until you apply a proposal.</p><button onClick={() => setInstruction("Create a polished promotion page with a banner and coupon")}>Create a promotion page <span>↗</span></button><button onClick={() => setInstruction("Make the page feel more premium and concise")}>Refine the page style <span>↗</span></button></div> : messages.map((message) => <article key={message.id} className={`chat-message chat-message--${message.role}`}>
          <div className="chat-message__avatar" aria-hidden="true">{message.role === "assistant" ? <Bot size={14} /> : "Y"}</div><div className="chat-message__body"><div className="chat-message__label">{message.role === "assistant" ? "COPILOT" : "YOU"}</div><p>{message.content}</p>
            {message.status === "failed" ? <button className="chat-message__retry" onClick={() => { setInstruction(message.content); }} type="button">Edit and retry</button> : null}
            {message.proposalId ? <div className="proposal-card"><div className="proposal-card__heading"><span>✧</span><div><strong>Page proposal</strong><small>{message.proposalState === "applied" ? "Applied to draft" : message.proposalState === "discarded" ? "Discarded" : message.proposalState === "outdated" ? "Outdated · draft changed" : "Ready for your review"}</small></div></div>{message.proposalState === "pending" ? <><ul className="proposal-change-list">{(pending?.id === message.proposalId ? diffPageSchemas(pending.baseDraftSnapshot, pending.proposedSchema) : []).map((change, index) => <li key={index}>{change.kind === "prop_updated" ? <><strong>{change.componentType}</strong> · {change.propKey}<span>{String(change.before)} → {String(change.after)}</span></> : change.kind === "title_changed" ? <>Page title<span>{change.before} → {change.after}</span></> : change.kind === "component_added" ? <>Added <strong>{change.componentType}</strong></> : change.kind === "component_removed" ? <>Removed <strong>{change.componentType}</strong></> : <>Moved <strong>{change.componentType}</strong></>}</li>)}</ul><div className="proposal-card__actions"><button disabled={proposalBaseRevision !== revision || pending?.baseRevision !== revision} onClick={() => apply(message)} type="button">Apply to page</button><button onClick={() => discard(message)} type="button">Discard</button></div></> : null}<details className="copilot-panel__trace"><summary>Technical details · {pending?.id === message.proposalId ? pending.trace.length : 0} steps</summary><ul>{(pending?.id === message.proposalId ? pending.trace : []).map((item, index) => <li key={`${item.toolName}-${index}`}><strong>{item.toolName} · {item.outcome === "error" ? "Error" : "Completed"}</strong><span>{item.summary}</span><code>{JSON.stringify(item.arguments, null, 2)}</code></li>)}</ul></details></div> : null}
          </div></article>)}
        {running ? <div className="copilot-thinking" role="status"><Sparkles aria-hidden="true" size={14} /> Thinking through your page…</div> : null}
      </div>
      {error ? <p className="copilot-panel__error" role="alert">{error}</p> : null}
      <div className="copilot-composer"><label className="sr-only" htmlFor="copilot-instruction">Describe the page or change you want</label><textarea id="copilot-instruction" placeholder="Tell me what you’d like to change…" value={instruction} onChange={(event) => { setInstruction(event.target.value); if (pageSchema) updateSession(pageSchema.id, (current) => ({ ...current, composerDraft: event.target.value })); }} onKeyDown={submitOnEnter} /><div className="copilot-composer__footer"><span><CornerDownLeft aria-hidden="true" size={11} /> to send · ⇧↵ for a new line</span><button aria-label="Send message" disabled={running || !instruction.trim()} onClick={() => void generate()} type="button">{running ? <CircleHelp size={15} /> : <Send aria-hidden="true" size={14} />}</button></div></div>
    </section>
  );
}
