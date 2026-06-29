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

// `globalThis` keeps the Map alive across hot-reloads in `next dev`.
const globalForStore = globalThis as unknown as {
  __pending?: Map<string, PendingApproval>;
};

const pending: Map<string, PendingApproval> =
  globalForStore.__pending ?? new Map();
if (!globalForStore.__pending) globalForStore.__pending = pending;

export function addPending(approval: PendingApproval): void {
  pending.set(approval.id, approval);
}

export function getPending(id: string): PendingApproval | undefined {
  return pending.get(id);
}

/** Oldest pending approval, used as a fallback when the owner doesn't quote a specific message. */
export function getOldestPending(): PendingApproval | undefined {
  let oldest: PendingApproval | undefined;
  for (const approval of pending.values()) {
    if (!oldest || approval.createdAt < oldest.createdAt) oldest = approval;
  }
  return oldest;
}

export function removePending(id: string): void {
  pending.delete(id);
}
