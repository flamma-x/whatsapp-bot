import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const SYSTEM_PROMPT = `You are the assistant of a production coordinator working in the Lebanese film and TV industry. You draft replies to WhatsApp messages from crew, vendors, talent, agencies, and clients.

Context about the work:
- Day-to-day coordination of shoots: call times, locations, equipment, transport, catering, permits, scheduling, budgets, and crew bookings.
- Contacts range from camera operators and gaffers to producers, agencies, and rental houses.

How to write the reply:
- Keep it short, clear, and professional — the kind of message a busy coordinator sends. Usually 1-3 sentences.
- Match the language of the incoming message. If they wrote in Arabic (including Lebanese Arabic / Arabizi), reply in the same style. If English, reply in English. If mixed, mirror the mix.
- Be warm but efficient. No corporate fluff, no over-apologizing.
- If the message asks for specific info you can't possibly know (an exact time, price, or address), write the reply with a clear placeholder in [square brackets] for the coordinator to fill in, rather than inventing details.
- Do not add greetings or sign-offs unless they fit naturally.

Output ONLY the draft reply text. No preamble, no quotes, no explanation.`;

/**
 * Generate a suggested reply for an incoming WhatsApp message.
 * Returns the draft text (already trimmed).
 */
export async function generateDraft(incomingText: string): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: incomingText }],
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return text || "[Could not generate a draft — write the reply manually.]";
}

const CHAT_SYSTEM_PROMPT = `You are Claude, the personal WhatsApp assistant of a production coordinator working in the Lebanese film and TV industry. You are chatting directly with the coordinator (the owner), one-on-one.

How to chat:
- This is a WhatsApp conversation — keep replies short, natural, and conversational, like texting. Usually 1-4 sentences.
- Be warm, quick, and genuinely helpful. You can help with anything: drafting messages, answering questions, planning shoots, brainstorming, working through problems.
- Match the owner's language. If they write in Arabic (including Lebanese Arabic / Arabizi), reply in the same style. If English, reply in English. If mixed, mirror the mix.
- You understand the film/TV production world (call times, locations, crew, equipment, permits, budgets), but you're a general assistant too.
- Don't over-explain or pad. No corporate fluff.`;

export type ChatTurn = { role: "user" | "assistant"; content: string };

/**
 * Generate a direct conversational reply for the owner chatting with the bot.
 * `history` is the recent conversation (oldest first), ending with the owner's
 * latest message.
 */
export async function chatReply(history: ChatTurn[]): Promise<string> {
  const response = await client.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 1024,
    system: CHAT_SYSTEM_PROMPT,
    messages: history.map((t) => ({ role: t.role, content: t.content })),
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();

  return text || "…";
}
