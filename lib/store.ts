// In-memory pending-approval store.
//
// NOTE: this resets on every redeploy / cold start, and is NOT shared across
// serverless instances. It's fine for a single-user, low-volume setup. To make
// this durable, swap this module for Redis (Upstash) or a Supabase table —
// the rest of the app only depends on the exported functions below.

export type PendingApproval = {
  /** wamid of the approval-request message we sent to the owner. */
  id: string;
  /** Original sender's WhatsApp number (E.164, no +) — where the final reply goes. */
  from: string;
  /** Original sender's WhatsApp profile name, if Meta provided one. */
  fromName: string;
  /** The message the contact sent us. */
  incomingText: string;
  /** Claude's proposed reply. */
  draftText: string;
  /** Epoch ms when we received the message. */
  createdAt: number;
};

/** A single turn in the owner's direct chat with the bot. */
export type ChatTurn = { role: "user" | "assistant"; content: string };

const MAX_OWNER_HISTORY = 20;

// `globalThis` keeps these alive across hot-reloads in `next dev`.
const globalForStore = globalThis as unknown as {
  __pending?: Map<string, PendingApproval>;
  __ownerChat?: ChatTurn[];
};

const pending: Map<string, PendingApproval> =
  globalForStore.__pending ?? new Map();
if (!globalForStore.__pending) globalForStore.__pending = pending;

const ownerChat: ChatTurn[] = globalForStore.__ownerChat ?? [];
if (!globalForStore.__ownerChat) globalForStore.__ownerChat = ownerChat;

export function addPending(approval: PendingApproval): void {
  pending.set(approval.id, approval);
}

export function getPending(id: string): PendingApproval | undefined {
  return pending.get(id);
}

export function removePending(id: string): void {
  pending.delete(id);
}

/** Most recently created pending approval, if any. */
export function getLatestPending(): PendingApproval | undefined {
  let latest: PendingApproval | undefined;
  for (const approval of pending.values()) {
    if (!latest || approval.createdAt > latest.createdAt) latest = approval;
  }
  return latest;
}

export function pendingCount(): number {
  return pending.size;
}

/** Append a turn to the owner's chat history and return the (trimmed) history. */
export function appendOwnerTurn(turn: ChatTurn): ChatTurn[] {
  ownerChat.push(turn);
  if (ownerChat.length > MAX_OWNER_HISTORY) {
    ownerChat.splice(0, ownerChat.length - MAX_OWNER_HISTORY);
  }
  return [...ownerChat];
}
