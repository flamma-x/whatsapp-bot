import { NextResponse } from "next/server";
import { parseIncomingMessage, sendMessage } from "@/lib/whatsapp";
import { generateDraft } from "@/lib/claude";
import {
  addPending,
  getOldestPending,
  getPending,
  removePending,
} from "@/lib/store";

// Webhook handlers must run on the Node.js runtime (they use the Anthropic SDK)
// and must never be cached.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Normalize a WhatsApp number for comparison (strip a leading '+'). */
function normalize(num: string): string {
  return num.replace(/^\+/, "");
}

/**
 * GET — Meta webhook verification handshake.
 * Meta calls this once when you configure the webhook; echo back hub.challenge
 * only if the verify token matches.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return new Response(challenge ?? "", { status: 200 });
  }

  return new Response("Forbidden", { status: 403 });
}

/**
 * POST — incoming message events.
 *
 * - Message from a contact: ask Claude for a draft, send it to the owner's
 *   WhatsApp number for approval.
 * - Message from the owner: treat it as a reply to the pending approval it
 *   quotes (or, if not quoted, the oldest pending one). "send" forwards the
 *   Claude draft as-is; any other text is forwarded verbatim instead.
 *
 * We always return 200 quickly so Meta doesn't retry.
 */
export async function POST(request: Request) {
  const ownerNumber = process.env.WHATSAPP_OWNER_NUMBER;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: true }); // ignore unparseable bodies
  }

  const message = parseIncomingMessage(body);
  if (!message) {
    // Status update, reaction, non-text message, etc. — nothing to do.
    return NextResponse.json({ ok: true });
  }

  const fromOwner =
    !!ownerNumber && normalize(message.from) === normalize(ownerNumber);

  if (fromOwner) {
    const approval =
      (message.replyToId && getPending(message.replyToId)) ??
      getOldestPending();

    if (!approval) {
      // Nothing pending — ignore stray messages from the owner.
      return NextResponse.json({ ok: true });
    }

    const reply =
      message.text.trim().toLowerCase() === "send"
        ? approval.draftText
        : message.text.trim();

    try {
      await sendMessage(approval.from, reply);
      removePending(approval.id);
    } catch (err) {
      console.error("Forward to original sender failed:", err);
    }

    return NextResponse.json({ ok: true });
  }

  // Message from a contact: draft a reply and ask the owner to approve it.
  if (!ownerNumber) {
    console.error("WHATSAPP_OWNER_NUMBER is not set — cannot request approval.");
    return NextResponse.json({ ok: true });
  }

  try {
    const draftText = await generateDraft(message.text);

    const approvalText = `New message from ${message.fromName} (${message.from}):\n"${message.text}"\n\nSuggested reply:\n${draftText}\n\nReply "send" to use this, or send your own reply text instead.`;

    const wamid = await sendMessage(ownerNumber, approvalText);

    if (wamid) {
      addPending({
        id: wamid,
        from: message.from,
        fromName: message.fromName,
        incomingText: message.text,
        draftText,
        createdAt: Date.now(),
      });
    }
  } catch (err) {
    console.error("Draft/approval request failed:", err);
  }

  return NextResponse.json({ ok: true });
}
