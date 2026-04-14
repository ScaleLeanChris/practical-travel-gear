# AgentMail Email Provider Plugin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create an EmDash plugin that sends all CMS emails through AgentMail via `adventure@practicaltravelgear.com`.

**Architecture:** Standard-format EmDash plugin with a descriptor (build time) and sandbox entry (runtime). The `email:deliver` exclusive hook calls AgentMail's REST API via `ctx.http.fetch()`. Settings (API key, inbox ID) are configured in the admin UI via `settingsSchema` and read from plugin KV at send time.

**Tech Stack:** TypeScript, EmDash plugin SDK, Cloudflare Workers, AgentMail REST API

---

## File Structure

| File | Purpose |
|---|---|
| Create: `packages/plugin-agentmail/package.json` | Package metadata and exports |
| Create: `packages/plugin-agentmail/tsconfig.json` | TypeScript config |
| Create: `packages/plugin-agentmail/src/index.ts` | Plugin descriptor factory (build time) |
| Create: `packages/plugin-agentmail/src/sandbox-entry.ts` | `definePlugin()` with `email:deliver` hook (runtime) |
| Modify: `package.json` | Add workspace config + local dependency |
| Modify: `astro.config.mjs` | Register the plugin |
| Modify: `tsconfig.json` | Include `packages/` in TypeScript compilation |

---

### Task 1: Create the plugin package scaffolding

**Files:**
- Create: `packages/plugin-agentmail/package.json`
- Create: `packages/plugin-agentmail/tsconfig.json`

- [ ] **Step 1: Create the package directory**

```bash
mkdir -p packages/plugin-agentmail/src
```

- [ ] **Step 2: Create `packages/plugin-agentmail/package.json`**

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

- [ ] **Step 3: Create `packages/plugin-agentmail/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "rootDir": "src",
    "outDir": "dist"
  },
  "include": ["src"]
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/plugin-agentmail/package.json packages/plugin-agentmail/tsconfig.json
git commit -m "scaffold: agentmail plugin package structure"
```

---

### Task 2: Write the plugin descriptor

**Files:**
- Create: `packages/plugin-agentmail/src/index.ts`

- [ ] **Step 1: Create `packages/plugin-agentmail/src/index.ts`**

This is the descriptor factory. It runs at Vite build time (imported in `astro.config.mjs`). It declares metadata, capabilities, allowed hosts, and the settings schema for the admin UI.

```typescript
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
		admin: {
			settingsSchema: {
				apiKey: {
					type: "secret",
					label: "API Key",
					description: "Your AgentMail API key (starts with am_)",
				},
				inboxId: {
					type: "string",
					label: "Inbox ID",
					description:
						"The inbox to send from (e.g. adventure@practicaltravelgear.com)",
				},
			},
		},
	};
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-agentmail/src/index.ts
git commit -m "feat: agentmail plugin descriptor with settings schema"
```

---

### Task 3: Write the email deliver hook

**Files:**
- Create: `packages/plugin-agentmail/src/sandbox-entry.ts`

- [ ] **Step 1: Create `packages/plugin-agentmail/src/sandbox-entry.ts`**

This is the runtime implementation. It registers the `email:deliver` exclusive hook that reads settings from KV and calls the AgentMail API.

```typescript
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
					throw new Error(
						"AgentMail not configured — set API Key and Inbox ID in Settings > Email",
					);
				}

				const url = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`;

				const response = await ctx.http!.fetch(url, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						to: message.to,
						subject: message.subject,
						text: message.text,
						html: message.html,
					}),
				});

				if (!response.ok) {
					const body = await response.text();
					ctx.log.error("AgentMail delivery failed", {
						status: response.status,
						body,
						to: message.to,
					});
					throw new Error(`AgentMail API error ${response.status}: ${body}`);
				}

				ctx.log.info("Email delivered via AgentMail", { to: message.to });
			},
		},
	},
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-agentmail/src/sandbox-entry.ts
git commit -m "feat: agentmail email:deliver hook implementation"
```

---

### Task 4: Wire the plugin into the site

**Files:**
- Modify: `package.json` (root)
- Modify: `tsconfig.json` (root)
- Modify: `astro.config.mjs`

- [ ] **Step 1: Add workspace config and local dependency to root `package.json`**

Add `"workspaces"` and the local dependency:

```json
{
  "workspaces": ["packages/*"],
  "dependencies": {
    "plugin-agentmail": "*"
  }
}
```

The `workspaces` field tells npm to resolve `plugin-agentmail` from `packages/plugin-agentmail/`. The dependency entry ensures it's linked.

- [ ] **Step 2: Add `packages/` to `tsconfig.json` include**

Update the `include` array in the root `tsconfig.json`:

```json
{
  "include": [
    "src",
    "packages",
    ".astro/types.d.ts",
    "emdash-env.d.ts"
  ]
}
```

- [ ] **Step 3: Register the plugin in `astro.config.mjs`**

Add the import at the top:

```typescript
import { agentMailPlugin } from "plugin-agentmail";
```

Add it to the `plugins` array (alongside `formsPlugin()`):

```typescript
plugins: [formsPlugin(), agentMailPlugin()],
```

- [ ] **Step 4: Install dependencies to link the workspace**

```bash
npm install
```

This resolves the workspace link so `plugin-agentmail` is importable.

- [ ] **Step 5: Run typecheck to verify everything compiles**

```bash
npm run typecheck
```

Expected: no errors related to the plugin import or types.

- [ ] **Step 6: Commit**

```bash
git add package.json package-lock.json tsconfig.json astro.config.mjs
git commit -m "feat: register agentmail plugin in site config"
```

---

### Task 5: Test locally with dev server

- [ ] **Step 1: Start the dev server**

```bash
npx emdash dev
```

Expected: server starts without errors. The agentmail plugin should appear in the plugin list.

- [ ] **Step 2: Check the email settings in admin**

Open `http://localhost:4321/_emdash/admin` and navigate to Settings > Email. Verify:
- "agentmail" appears as an available email provider
- You can select it
- The settings form shows "API Key" and "Inbox ID" fields

- [ ] **Step 3: Configure the plugin settings**

In the admin Email settings:
- Select "agentmail" as the provider
- Enter the API key
- Enter `adventure@practicaltravelgear.com` as the Inbox ID
- Save

- [ ] **Step 4: Send a test email**

Use the "Send test email" button in Settings > Email. Verify the email arrives.

- [ ] **Step 5: Commit any adjustments**

If any fixes were needed during testing, commit them:

```bash
git add -A
git commit -m "fix: agentmail plugin adjustments from local testing"
```

---

### Task 6: Deploy and verify on production

- [ ] **Step 1: Build the site**

```bash
npm run build
```

Expected: clean build with no errors.

- [ ] **Step 2: Deploy to Cloudflare**

```bash
npm run deploy
```

- [ ] **Step 3: Configure in production admin**

Open the production admin at `https://<site-url>/_emdash/admin`, go to Settings > Email:
- Select "agentmail" as the provider
- Enter the API key and inbox ID
- Send a test email to verify

- [ ] **Step 4: Test a user invite**

Invite a new user through the admin UI and verify the invite email arrives from `adventure@practicaltravelgear.com`.
