# WhatsApp Claude Bot

A WhatsApp bot powered by Claude with two modes on the same business number:

- **Live chat** — when *you* (the owner) message the bot, Claude replies to you
  directly, with short-term conversation memory. A personal assistant in your chat.
- **Draft & approve** — when *someone else* messages the bot, Claude drafts a
  reply (as a Lebanese-film-industry production coordinator) and sends it to your
  personal number for approval before anything goes back to the contact.

**Stack:** Next.js (App Router) · Claude API (`claude-sonnet-4-6`) · Meta WhatsApp
Cloud API · in-memory store (no database).

---

## How it works

1. Meta POSTs every inbound message to `/api/webhook`.
2. **If the sender is `WHATSAPP_OWNER_NUMBER`:**
   - If the message **swipe-replies (quotes) a pending approval** → it's an
     approval: `"send"` forwards Claude's draft to the original contact; any
     other text forwards that text instead.
   - Otherwise → it's a **direct chat**; Claude replies straight back to you.
3. **If the sender is anyone else:** Claude drafts a reply and sends it to your
   `WHATSAPP_OWNER_NUMBER` for approval (swipe-reply the draft to approve/edit).

## Project layout

```
app/
  api/
    webhook/route.ts   GET (Meta verify) + POST (incoming/owner messages → Claude → approval/forward)
  page.tsx             simple status page
lib/
  claude.ts            generateDraft (coordinator) + chatReply (owner live chat)
  whatsapp.ts          parse inbound webhooks + send via Cloud API
  store.ts             in-memory pending approvals + owner chat history (resets on redeploy)
```

## Setup

1. **Install & configure**

   ```bash
   npm install
   cp .env.local.example .env.local   # then fill in the values
   ```

   | Variable                   | Where to get it                                              |
   | -------------------------- | ------------------------------------------------------------ |
   | `WHATSAPP_TOKEN`           | Meta App Dashboard → WhatsApp → API Setup (access token)     |
   | `WHATSAPP_PHONE_NUMBER_ID` | Same page — the **Phone number ID**, not the phone number    |
   | `WHATSAPP_VERIFY_TOKEN`    | Any random string you invent (you paste it into Meta too)    |
   | `WHATSAPP_OWNER_NUMBER`    | Your personal WhatsApp number, E.164 without '+'              |
   | `ANTHROPIC_API_KEY`        | https://console.anthropic.com → API keys                     |

2. **Run locally**

   ```bash
   npm run dev
   ```

3. **Deploy to Vercel** (to get a public HTTPS URL for the webhook)

   - Push to a Git repo and import into Vercel, or run `vercel`.
   - Add all the env vars above in the Vercel project settings.

4. **Connect the Meta webhook**

   - Meta Developer Dashboard → your app → **WhatsApp → Configuration → Webhook**.
   - **Callback URL:** `https://your-app.vercel.app/api/webhook`
   - **Verify token:** the exact value of your `WHATSAPP_VERIFY_TOKEN`.
   - Click **Verify and save** (Meta calls `GET /api/webhook` to confirm).
   - **Subscribe** to the **messages** field.

5. **Test:** message your business number from another phone → a draft shows up
   on your own WhatsApp within a few seconds. Reply "send" or with your own text.

## Things to know

- **Pending approvals are in-memory.** They reset on every redeploy/cold start
  and aren't shared across serverless instances. Fine for a single user; for
  durability, swap `lib/store.ts` for Redis (Upstash) or Supabase.
- **24-hour window.** WhatsApp only lets you free-form reply within 24h of the
  user's last message. Outside that window you must use approved message
  templates — this bot is built for inside-the-window replies.
- **Language.** Claude mirrors the incoming language (Arabic / English / mixed).
  Tune the system prompt in `lib/claude.ts`.
- **Model.** Set to `claude-sonnet-4-6` in `lib/claude.ts`.
