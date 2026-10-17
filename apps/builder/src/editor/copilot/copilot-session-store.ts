import { create } from "zustand";
import type { AgentHistoryMessage, AgentResponse, PageSchema } from "@mpp/schema";

export interface CopilotMessage extends AgentHistoryMessage {
  id: string;
  status?: "sending" | "failed";
  proposalId?: string;
  proposalState?: "pending" | "applied" | "discarded" | "outdated";
}

export interface PendingProposal {
  id: string;
  pageId: string;
  baseRevision: number;
  baseDraftSnapshot: PageSchema;
  proposedSchema: PageSchema;
  messageId: string;
  trace: AgentResponse["trace"];
}

export interface PageCopilotSession {
  messages: CopilotMessage[];
  pending: PendingProposal | null;
  composerDraft: string;
  requestStatus: "idle" | "running";
  error: string | null;
}

const STORAGE_PREFIX = "mpp:copilot:v2:";
const MAX_MESSAGES = 50;
const MAX_MESSAGE_LENGTH = 3000;
function emptySession(): PageCopilotSession { return { messages: [], pending: null, composerDraft: "", requestStatus: "idle", error: null }; }

function load(pageId: string): PageCopilotSession {
  try {
    const value = JSON.parse(localStorage.getItem(`${STORAGE_PREFIX}${pageId}`) ?? "null") as Partial<PageCopilotSession> | null;
    if (!value || !Array.isArray(value.messages)) return emptySession();
    const messages = value.messages.filter((message): message is CopilotMessage => !!message && typeof message.id === "string" && typeof message.content === "string" && (message.role === "user" || message.role === "assistant")).slice(-MAX_MESSAGES).map((message) => ({ ...message, content: message.content.slice(0, MAX_MESSAGE_LENGTH) }));
    const pending = value.pending && value.pending.pageId === pageId && value.pending.proposedSchema?.id === pageId ? value.pending : null;
    return { messages, pending, composerDraft: typeof value.composerDraft === "string" ? value.composerDraft.slice(0, 1500) : "", requestStatus: "idle", error: null };
  } catch { return emptySession(); }
}

function persist(pageId: string, session: PageCopilotSession) {
  try { localStorage.setItem(`${STORAGE_PREFIX}${pageId}`, JSON.stringify({ ...session, messages: session.messages.slice(-MAX_MESSAGES).map((message) => ({ ...message, content: message.content.slice(0, MAX_MESSAGE_LENGTH) })), pending: session.pending ? { ...session.pending, trace: [] } : null })); } catch { /* browser storage is optional */ }
}

interface CopilotState {
  sessions: Record<string, PageCopilotSession>;
  ensureSession: (pageId: string, acceptedDraft: PageSchema) => void;
  updateSession: (pageId: string, update: (session: PageCopilotSession) => PageCopilotSession) => void;
  clearSession: (pageId: string) => void;
}

export const useCopilotSessionStore = create<CopilotState>((set, get) => ({
  sessions: {},
  ensureSession: (pageId, acceptedDraft) => {
    if (get().sessions[pageId]) return;
    let session = load(pageId);
    if (session.pending && JSON.stringify(session.pending.baseDraftSnapshot) !== JSON.stringify(acceptedDraft)) {
      session = { ...session, pending: null, messages: session.messages.map((message) => message.proposalState === "pending" ? { ...message, proposalState: "outdated" } : message) };
      persist(pageId, session);
    }
    set((state) => ({ sessions: { ...state.sessions, [pageId]: session } }));
  },
  updateSession: (pageId, update) => set((state) => {
    const session = update(state.sessions[pageId] ?? emptySession());
    persist(pageId, session);
    return { sessions: { ...state.sessions, [pageId]: session } };
  }),
  clearSession: (pageId) => {
    try { localStorage.removeItem(`${STORAGE_PREFIX}${pageId}`); } catch { /* browser storage is optional */ }
    set((state) => ({ sessions: { ...state.sessions, [pageId]: emptySession() } }));
  }
}));
