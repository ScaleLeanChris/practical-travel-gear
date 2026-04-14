# AgentMail Email Provider for EmDash

## Summary

Create a standard-format EmDash plugin that delivers all CMS emails (user invites, magic links, account recovery) through AgentMail's REST API using the `adventure@practicaltravelgear.com` inbox.

## Context

EmDash has a three-stage email pipeline with an `email:deliver` exclusive hook. No email provider is currently configured — only the dev console fallback exists. The site needs outbound email for user invites and will later need it for form notifications and other transactional emails.

AgentMail account is set up with:
- Domain: `practicaltravelgear.com` (verified, DKIM/SPF configured)
- Inbox: `adventure@practicaltravelgear.com` (inbox_id: `adventure@practicaltravelgear.com`)
- API endpoint: `POST https://api.agentmail.to/v0/inboxes/{inbox_id}/messages/send`
- Auth: Bearer token

## Plugin Structure

Standard-format EmDash plugin as a local package:

```
packages/plugin-agentmail/
├── src/
│   ├── index.ts            # Descriptor factory (runs in Vite at build time)
│   └── sandbox-entry.ts    # definePlugin() with email:deliver hook (runs at request time)
├── package.json
└── tsconfig.json
```

### `src/index.ts` — Descriptor (build time)

```ts
import type { PluginDescriptor } from "emdash";

export function agentMailPlugin(): PluginDescriptor {
  return {
    id: "agentmail",
    version: "1.0.0",
    format: "standard",
    entrypoint: "plugin-agentmail/sandbox",
    options: {},
    capabilities: ["email:provide", "network:fetch"],
    allowedHosts: ["api.agentmail.to"],
  };
}
```

### `src/sandbox-entry.ts` — Implementation (request time)

```ts
import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

export default definePlugin({
  hooks: {
    "email:deliver": {
      exclusive: true,
      timeout: 30000,
      handler: async (event: any, ctx: PluginContext) => {
        const { message } = event;

        const apiKey = await ctx.kv.get<string>("settings:apiKey");
        const inboxId = await ctx.kv.get<string>("settings:inboxId");
        if (!apiKey || !inboxId) {
          throw new Error("AgentMail not configured: missing API key or inbox ID");
        }

        const response = await ctx.http!.fetch(
          `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`,
          {
            method: "POST",
            headers: {
              "Authorization": `Bearer ${apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              to: message.to,
              subject: message.subject,
              text: message.text,
              html: message.html,
            }),
          }
        );

        if (!response.ok) {
          const body = await response.text();
          throw new Error(`AgentMail API error ${response.status}: ${body}`);
        }
      },
    },
  },
});
```

### `package.json`

```json
{
  "name": "plugin-agentmail",
  "version": "1.0.0",
  "type": "module",
  "exports": {
    ".": "./src/index.ts",
    "./sandbox": "./src/sandbox-entry.ts"
  },
  "peerDependencies": {
    "emdash": "^0.5.0"
  }
}
```

## Configuration

### Plugin registration in `astro.config.mjs`

```ts
import { agentMailPlugin } from "plugin-agentmail";

// in emdash config:
plugins: [formsPlugin(), agentMailPlugin()],
```

### Workspace reference in root `package.json`

Add the local package as a workspace dependency or direct file reference so the import resolves.

### Settings via KV

The API key and inbox ID are stored in the plugin's KV store (not Cloudflare secrets), configured through EmDash admin Settings > Email after selecting the AgentMail provider. Values:

| KV Key | Value |
|---|---|
| `settings:apiKey` | AgentMail API key |
| `settings:inboxId` | `adventure@practicaltravelgear.com` |

These are set once in the admin UI after deployment.

## Email Flow

```
EmDash system email (invite/magic link/recovery)
  -> email:deliver hook (exclusive)
    -> plugin reads EmailMessage { to, subject, text, html }
    -> ctx.http.fetch POST https://api.agentmail.to/v0/inboxes/{inboxId}/messages/send
       Authorization: Bearer {apiKey}
       Body: { to, subject, text, html }
    -> throws on non-2xx response (EmDash handles the error)
```

## Activation

1. Deploy the site with the plugin registered
2. Go to EmDash admin: Settings > Email
3. Select "agentmail" as the email provider
4. Configure the API key and inbox ID in the plugin settings
5. Use "Send test email" to verify delivery

## What this handles

- User invite emails
- Magic link authentication
- Account recovery emails
- Admin test emails
- Future: any plugin using `ctx.email.send()` (form notifications, etc.)

## What this does NOT handle

- Inbound email (not needed)
- Email templates/styling (EmDash generates content)
- Retry logic (EmDash's pipeline handles errors; AgentMail handles delivery retries)

## Dependencies

- No npm dependencies added — uses `ctx.http.fetch()`
- AgentMail Developer plan ($20/mo) — already active
- Local package in `packages/plugin-agentmail/`
