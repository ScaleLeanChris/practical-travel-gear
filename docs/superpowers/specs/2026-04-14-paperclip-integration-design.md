# Paperclip Integration Plugin Design

## Overview

Bidirectional integration between the EmDash CMS and [Paperclip](https://github.com/paperclipai/paperclip), the open-source AI agent orchestration platform. Two plugins work as a pair:

| Plugin | Runtime | Purpose |
|--------|---------|---------|
| `plugin-paperclip` | EmDash (Cloudflare Workers) | Sends CMS events to Paperclip, exposes API for agent-driven content ops |
| `plugin-emdash-cms` | Paperclip (Node.js) | Gives agents CMS tools, receives webhooks, emits events to Paperclip bus |

## Data Flows

### EmDash -> Paperclip

1. **Content lifecycle events** — `content:afterSave` hook forwards publish/update/draft events to Paperclip's webhook endpoint. Events include entry data, collection, SEO scores (from `plugin-seo-toolkit`), and timestamps.
2. **SEO data** — On-demand API route exposes audit results, analysis scores, ranked keywords, and backlink data so Paperclip agents can query CMS health.
3. **Cron digest** — Weekly cron assembles a site health summary (avg SEO score, content count, issues) and posts it to Paperclip as an activity update.

### Paperclip -> EmDash

1. **Agent content operations** — Paperclip agents call the EmDash plugin's inbound API to create drafts, update content, request audits, and query SEO data.
2. **Task assignments** — Paperclip plugin pushes task/issue context so the EmDash admin can see what agents are working on.

## EmDash Plugin: `plugin-paperclip`

### Descriptor

```typescript
{
  id: "paperclip",
  version: "1.0.0",
  format: "standard",
  capabilities: ["read:content", "network:fetch"],
  allowedHosts: [], // Configured at runtime via settings
  storage: {
    event_log: { indexes: ["eventType", "collection", "timestamp"] },
    tasks: { indexes: ["status", "agentId", "updatedAt"] }
  },
  adminPages: [
    { path: "/dashboard", label: "Paperclip", icon: "cpu" },
    { path: "/activity", label: "Activity Log", icon: "activity" },
    { path: "/settings", label: "Settings", icon: "settings" }
  ]
}
```

### Hooks

| Hook | Priority | Behavior |
|------|----------|----------|
| `content:afterSave` | 300 (after SEO at 200) | Reads SEO analysis score, forwards event to Paperclip webhook |
| `cron` | — | Posts weekly site health digest to Paperclip |

### Admin Routes

| Page | Purpose |
|------|---------|
| `/dashboard` | Agent activity feed, active tasks, site health summary |
| `/activity` | Scrollable log of events sent to/received from Paperclip |
| `/settings` | API base URL, API key, company ID, agent ID, event toggles |

### Inbound API Route

Route `api` handles JSON requests from Paperclip agents:

| Action | Description |
|--------|-------------|
| `get_seo_scores` | Returns analysis scores for all or specific entries |
| `get_audit_results` | Returns audit results with issue details |
| `get_seo_summary` | Returns aggregate site SEO health |
| `get_content` | Returns entry data for a collection/slug |
| `list_content` | Lists entries in a collection with pagination |
| `get_keywords` | Returns cached ranked keywords from DataForSEO |

## Paperclip Plugin: `plugin-emdash-cms`

### Plugin Definition

Uses `@paperclipai/plugin-sdk` with `definePlugin()`.

### Tools (registered on `ctx.tools`)

| Tool | Description |
|------|-------------|
| `emdash.listContent` | List entries in a collection with filters |
| `emdash.getContent` | Get a specific entry by collection + slug |
| `emdash.getSeoScore` | Get SEO analysis score for an entry |
| `emdash.getSeoAudit` | Get full audit results for an entry |
| `emdash.getSiteSeoSummary` | Get aggregate site SEO health |
| `emdash.getKeywords` | Get ranked keywords from DataForSEO cache |
| `emdash.getBacklinks` | Get backlink summary and referring domains |

### Webhook Handler (`onWebhook`)

Receives events from the EmDash plugin:

| Event | Paperclip Action |
|-------|-----------------|
| `content.published` | Emit `emdash.content.published` event, optionally create review issue |
| `content.updated` | Emit `emdash.content.updated` event |
| `content.drafted` | Emit `emdash.content.drafted` event |
| `seo.digest` | Emit `emdash.seo.digest` event, log activity |

### Events (emitted to Paperclip bus)

All events prefixed with `emdash.` for namespace isolation.

### Configuration

| Key | Description |
|-----|-------------|
| `EMDASH_SITE_URL` | Base URL of the EmDash site |
| `EMDASH_API_SECRET` | Shared secret for authenticating inbound API calls |
| `AUTO_CREATE_ISSUES` | Whether to create Paperclip issues on content events |

## SEO Integration

The `content:afterSave` hook in `plugin-paperclip` runs at priority 300, after the SEO toolkit's hook at priority 200. This guarantees fresh SEO scores are available when the event is forwarded to Paperclip. The plugin reads from the SEO toolkit's storage tables:

- `analysis_scores` — per-entry content analysis (readability, keyword usage, structure)
- `audit_results` — per-entry audit (meta descriptions, titles, images, thin content)
- `domain_data` — cached DataForSEO data (keywords, backlinks)

## Authentication

Both directions use a shared secret:

- **EmDash -> Paperclip**: Bearer token in Authorization header (Paperclip API key)
- **Paperclip -> EmDash**: `X-Paperclip-Secret` header validated by the inbound API route

## Security Considerations

- API keys stored in plugin KV, never exposed in admin UI (secret_input fields)
- Inbound API route validates shared secret before processing any request
- Network fetch restricted to configured Paperclip host
- All events are fire-and-forget with error logging (never block content saves)
