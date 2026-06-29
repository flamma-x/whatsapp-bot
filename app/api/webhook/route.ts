import { NextResponse } from "next/server";
import { parseIncomingMessage, sendMessage } from "@/lib/whatsapp";
import { generateDraft, chatReply } from "@/lib/claude";
import {
  addPending,
  appendOwnerTurn,
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
 * - Message from the owner that swipe-replies (quotes) a pending approval:
 *   "send" forwards the Claude draft as-is; any other text is forwarded
 *   verbatim to the original contact instead.
 * - Any other message from the owner: a direct live chat with Claude — Claude
 *   replies straight back to the owner.
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
    // If the owner swipe-replied to a pending approval, treat it as approval:
    // "send" forwards Claude's draft; anything else forwards their text.
    const approval = message.replyToId
      ? getPending(message.replyToId)
      : undefined;

    if (approval) {
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

    // Otherwise it's a direct live chat with Claude.
    try {
      const history = appendOwnerTurn({ role: "user", content: message.text });
      const reply = await chatReply(history);
      appendOwnerTurn({ role: "assistant", content: reply });
      await sendMessage(message.from, reply);
    } catch (err) {
      console.error("Owner chat reply failed:", err);
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
