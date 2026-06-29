// Helpers for parsing inbound webhooks and sending messages via the
// Meta WhatsApp Cloud API (Graph API).

const GRAPH_VERSION = "v21.0";

export type IncomingMessage = {
  /** Provider message id (used to dedupe / as the draft id). */
  messageId: string;
  /** Sender number in E.164 without '+' (e.g. "9613123456"). */
  from: string;
  /** Sender's WhatsApp profile name, if present. */
  fromName: string;
  /** The text body of the message. */
  text: string;
  /** If this message is a swipe-reply/quote to another message, that message's id. */
  replyToId: string | null;
};

/**
 * Pull the first text message out of a Meta webhook POST body.
 * Returns null for non-message events (status updates, reactions, etc.).
 */
export function parseIncomingMessage(body: any): IncomingMessage | null {
  try {
    const entry = body?.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    const message = value?.messages?.[0];
    if (!message || message.type !== "text") return null;

    const from: string = message.from;
    const text: string = message.text?.body ?? "";
    if (!text) return null;

    const contact = value?.contacts?.[0];
    const fromName: string = contact?.profile?.name ?? from;

    return {
      messageId: message.id,
      from,
      fromName,
      text,
      replyToId: message.context?.id ?? null,
    };
  } catch {
    return null;
  }
}

/**
 * Send a text message via the Cloud API.
 * Returns the provider's message id (wamid) for the sent message.
 * Throws with the Graph API error body if the request fails.
 */
export async function sendMessage(to: string, text: string): Promise<string> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const token = process.env.WHATSAPP_TOKEN;

  if (!phoneNumberId || !token) {
    throw new Error(
      "Missing WHATSAPP_PHONE_NUMBER_ID or WHATSAPP_TOKEN environment variables.",
    );
  }

  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`;

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "text",
      text: { body: text },
    }),
  });

  if (!res.ok) {
    const errorBody = await res.text();
    throw new Error(`WhatsApp send failed (${res.status}): ${errorBody}`);
  }

  const data = await res.json();
  return data?.messages?.[0]?.id ?? "";
}
