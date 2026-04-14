# SEO Toolkit Plugin Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an EmDash plugin with content audit scoring, DataForSEO rank/backlink/AI visibility tracking, and on-save content analysis.

**Architecture:** Standard-format EmDash plugin (`plugin-seo-toolkit`) in the existing workspace at `packages/`. Three subsystems share storage collections and admin pages. All DataForSEO calls are domain-level batch requests cached in plugin storage. Content analysis runs locally on save with no API calls.

**Tech Stack:** TypeScript, EmDash plugin SDK, DataForSEO REST API (Basic Auth), Block Kit admin UI

---

## File Structure

| File | Purpose |
|---|---|
| Create: `packages/plugin-seo-toolkit/package.json` | Package metadata and exports |
| Create: `packages/plugin-seo-toolkit/tsconfig.json` | TypeScript config |
| Create: `packages/plugin-seo-toolkit/src/index.ts` | Plugin descriptor factory |
| Create: `packages/plugin-seo-toolkit/src/sandbox-entry.ts` | `definePlugin()` — hooks, routes, admin handler |
| Create: `packages/plugin-seo-toolkit/src/audit.ts` | Content audit logic — scans entries, calculates scores |
| Create: `packages/plugin-seo-toolkit/src/dataforseo.ts` | DataForSEO API client — batch calls, response parsing |
| Create: `packages/plugin-seo-toolkit/src/analysis.ts` | On-save content analysis — readability, keyword checks |
| Create: `packages/plugin-seo-toolkit/src/admin-dashboard.ts` | Block Kit builder for dashboard page |
| Create: `packages/plugin-seo-toolkit/src/admin-rankings.ts` | Block Kit builder for rankings page |
| Create: `packages/plugin-seo-toolkit/src/admin-backlinks.ts` | Block Kit builder for backlinks page |
| Create: `packages/plugin-seo-toolkit/src/admin-settings.ts` | Block Kit builder for settings page |
| Modify: `packages/plugin-seo-toolkit/src/sandbox-entry.ts` | Wire up subsystems progressively |
| Modify: `package.json` | Add workspace dependency |
| Modify: `astro.config.mjs` | Register plugin |
| Modify: `seed/seed.json` | Add `"seo"` to pages collection supports |

---

### Task 1: Plugin package scaffolding

**Files:**
- Create: `packages/plugin-seo-toolkit/package.json`
- Create: `packages/plugin-seo-toolkit/tsconfig.json`
- Create: `packages/plugin-seo-toolkit/src/index.ts`
- Create: `packages/plugin-seo-toolkit/src/sandbox-entry.ts`

- [ ] **Step 1: Create directories**

```bash
mkdir -p packages/plugin-seo-toolkit/src
```

- [ ] **Step 2: Create `packages/plugin-seo-toolkit/package.json`**

```json
{
	"name": "plugin-seo-toolkit",
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

- [ ] **Step 3: Create `packages/plugin-seo-toolkit/tsconfig.json`**

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

- [ ] **Step 4: Create `packages/plugin-seo-toolkit/src/index.ts`**

```typescript
import type { PluginDescriptor } from "emdash";

export function seoToolkitPlugin(): PluginDescriptor {
	return {
		id: "seo-toolkit",
		version: "1.0.0",
		format: "standard",
		entrypoint: "plugin-seo-toolkit/sandbox",
		options: {},
		capabilities: ["read:content", "read:media", "network:fetch"],
		allowedHosts: ["api.dataforseo.com"],
		storage: {
			audit_results: {
				indexes: ["entryId", "collection", "score", "lastAudit"],
			},
			domain_data: {
				indexes: ["dataType", "fetchedAt"],
			},
			analysis_scores: {
				indexes: ["entryId", "collection", "lastAnalysis"],
			},
		},
		adminPages: [
			{ path: "/dashboard", label: "SEO Dashboard", icon: "bar-chart" },
			{ path: "/rankings", label: "Rankings", icon: "trending-up" },
			{ path: "/backlinks", label: "Backlinks", icon: "link" },
			{ path: "/settings", label: "SEO Settings", icon: "settings" },
		],
	};
}
```

- [ ] **Step 5: Create minimal `packages/plugin-seo-toolkit/src/sandbox-entry.ts`**

```typescript
import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

export default definePlugin({
	hooks: {},
	routes: {
		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = routeCtx.input;
				if (interaction.type === "page_load") {
					return {
						blocks: [
							{ type: "header", text: "SEO Toolkit" },
							{ type: "context", text: "Plugin loaded. Subsystems will be wired up next." },
						],
					};
				}
				return { blocks: [] };
			},
		},
	},
});
```

- [ ] **Step 6: Commit**

```bash
git add packages/plugin-seo-toolkit/
git commit -m "scaffold: seo-toolkit plugin package"
```

---

### Task 2: Register plugin in site

**Files:**
- Modify: `package.json`
- Modify: `astro.config.mjs`
- Modify: `seed/seed.json`

- [ ] **Step 1: Add dependency to root `package.json`**

Add `"plugin-seo-toolkit": "*"` to the `dependencies` object (alongside existing `plugin-agentmail`).

- [ ] **Step 2: Register in `astro.config.mjs`**

Add import:
```typescript
import { seoToolkitPlugin } from "plugin-seo-toolkit";
```

Add to plugins array:
```typescript
plugins: [formsPlugin(), agentMailPlugin(), seoToolkitPlugin()],
```

- [ ] **Step 3: Add `"seo"` to pages collection in `seed/seed.json`**

Find the `pages` collection and add `"seo"` to its `"supports"` array. The `posts` collection already has it.

- [ ] **Step 4: Install and verify**

```bash
npm install --legacy-peer-deps
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add package.json package-lock.json astro.config.mjs seed/seed.json
git commit -m "feat: register seo-toolkit plugin, enable SEO on pages collection"
```

---

### Task 3: Content audit engine

**Files:**
- Create: `packages/plugin-seo-toolkit/src/audit.ts`

- [ ] **Step 1: Create `packages/plugin-seo-toolkit/src/audit.ts`**

```typescript
import type { PluginContext } from "emdash";

export interface AuditIssue {
	check: string;
	severity: "error" | "warning" | "info";
	detail: string;
}

export interface AuditResult {
	entryId: string;
	collection: string;
	slug: string;
	title: string;
	score: number;
	issues: AuditIssue[];
	lastAudit: string;
}

const WEIGHTS: Record<string, number> = {
	error: 20,
	warning: 10,
	info: 5,
};

function countWords(text: string): number {
	return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function extractTextFromPortableText(blocks: any[]): string {
	if (!Array.isArray(blocks)) return "";
	const parts: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && Array.isArray(block.children)) {
			for (const child of block.children) {
				if (typeof child.text === "string") parts.push(child.text);
			}
		}
	}
	return parts.join(" ");
}

function findImagesWithoutAlt(blocks: any[]): number {
	if (!Array.isArray(blocks)) return 0;
	let missing = 0;
	for (const block of blocks) {
		if (block._type === "image" && (!block.alt || block.alt.trim() === "")) {
			missing++;
		}
	}
	return missing;
}

function findInternalLinks(blocks: any[]): string[] {
	if (!Array.isArray(blocks)) return [];
	const links: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && Array.isArray(block.markDefs)) {
			for (const mark of block.markDefs) {
				if (mark._type === "link" && typeof mark.href === "string") {
					if (mark.href.startsWith("/") || mark.href.includes("practicaltravelgear.com")) {
						links.push(mark.href);
					}
				}
			}
		}
	}
	return links;
}

function findExternalLinks(blocks: any[]): string[] {
	if (!Array.isArray(blocks)) return [];
	const links: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && Array.isArray(block.markDefs)) {
			for (const mark of block.markDefs) {
				if (
					mark._type === "link" &&
					typeof mark.href === "string" &&
					mark.href.startsWith("http") &&
					!mark.href.includes("practicaltravelgear.com")
				) {
					links.push(mark.href);
				}
			}
		}
	}
	return links;
}

function auditEntry(
	entry: any,
	seo: any,
	allTitles: Map<string, string>,
): AuditIssue[] {
	const issues: AuditIssue[] = [];
	const body = entry.data?.body ?? [];
	const bodyText = extractTextFromPortableText(body);
	const wordCount = countWords(bodyText);

	// Resolve title: seo_title > entry title
	const resolvedTitle: string =
		seo?.title || entry.data?.title || entry.id || "";

	// Missing meta description
	const description = seo?.description || entry.data?.excerpt || "";
	if (!description || description.trim() === "") {
		issues.push({
			check: "missing_description",
			severity: "warning",
			detail: "No meta description or excerpt",
		});
	}

	// Short title
	if (resolvedTitle.length > 0 && resolvedTitle.length < 30) {
		issues.push({
			check: "short_title",
			severity: "warning",
			detail: `Title is ${resolvedTitle.length} chars (target: 30-60)`,
		});
	}

	// Long title
	if (resolvedTitle.length > 60) {
		issues.push({
			check: "long_title",
			severity: "warning",
			detail: `Title is ${resolvedTitle.length} chars (target: 30-60)`,
		});
	}

	// Missing featured image
	if (!seo?.image && !entry.data?.image) {
		issues.push({
			check: "missing_image",
			severity: "info",
			detail: "No featured/OG image",
		});
	}

	// Missing alt text
	const missingAlt = findImagesWithoutAlt(body);
	if (missingAlt > 0) {
		issues.push({
			check: "missing_alt_text",
			severity: "warning",
			detail: `${missingAlt} image${missingAlt > 1 ? "s" : ""} missing alt text`,
		});
	}

	// Thin content
	if (wordCount < 300) {
		issues.push({
			check: "thin_content",
			severity: "warning",
			detail: `Word count: ${wordCount} (target: 300+)`,
		});
	}

	// Duplicate titles
	const titleKey = resolvedTitle.toLowerCase().trim();
	const existing = allTitles.get(titleKey);
	if (existing && existing !== entry.id) {
		issues.push({
			check: "duplicate_title",
			severity: "error",
			detail: `Same title as entry "${existing}"`,
		});
	}

	// Noindex flagged
	if (seo?.noIndex) {
		issues.push({
			check: "noindex",
			severity: "info",
			detail: "Page is marked noindex",
		});
	}

	// Missing canonical
	if (!seo?.canonical) {
		issues.push({
			check: "missing_canonical",
			severity: "info",
			detail: "No explicit canonical URL",
		});
	}

	return issues;
}

function calculateScore(issues: AuditIssue[]): number {
	let score = 100;
	for (const issue of issues) {
		score -= WEIGHTS[issue.severity] ?? 0;
	}
	return Math.max(0, score);
}

export async function runAudit(ctx: PluginContext): Promise<AuditResult[]> {
	const results: AuditResult[] = [];
	const allTitles = new Map<string, string>();

	// Scan all published entries from content API
	const collections = ["posts", "pages"];
	const allEntries: Array<{ entry: any; collection: string; seo: any }> = [];

	for (const collection of collections) {
		try {
			const { items } = await ctx.content!.list(collection, {
				status: "published",
				limit: 1000,
			});
			for (const entry of items) {
				const seo = entry.seo ?? null;
				const title = (seo?.title || entry.data?.title || "").toLowerCase().trim();
				if (title) {
					const prev = allTitles.get(title);
					if (!prev) allTitles.set(title, entry.id);
				}
				allEntries.push({ entry, collection, seo });
			}
		} catch (err) {
			ctx.log.warn(`Audit: failed to list ${collection}`, err);
		}
	}

	for (const { entry, collection, seo } of allEntries) {
		const issues = auditEntry(entry, seo, allTitles);
		const score = calculateScore(issues);
		const result: AuditResult = {
			entryId: entry.id,
			collection,
			slug: entry.slug ?? entry.id,
			title: entry.data?.title ?? entry.id,
			score,
			issues,
			lastAudit: new Date().toISOString(),
		};
		results.push(result);

		// Store in plugin storage
		await ctx.storage.audit_results.put(entry.id, result);
	}

	return results;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/audit.ts
git commit -m "feat: content audit engine with scoring and issue detection"
```

---

### Task 4: DataForSEO API client

**Files:**
- Create: `packages/plugin-seo-toolkit/src/dataforseo.ts`

- [ ] **Step 1: Create `packages/plugin-seo-toolkit/src/dataforseo.ts`**

```typescript
import type { PluginContext } from "emdash";

interface DataForSEOCredentials {
	login: string;
	password: string;
}

async function getCredentials(ctx: PluginContext): Promise<DataForSEOCredentials | null> {
	const login = await ctx.kv.get<string>("settings:dataforseoLogin");
	const password = await ctx.kv.get<string>("settings:dataforseoPassword");
	if (!login || !password) return null;
	return { login, password };
}

function authHeader(creds: DataForSEOCredentials): string {
	return "Basic " + btoa(`${creds.login}:${creds.password}`);
}

async function apiCall(
	ctx: PluginContext,
	creds: DataForSEOCredentials,
	endpoint: string,
	body: unknown[],
): Promise<any> {
	const fetchFn = ctx.http!.fetch;
	const response = await fetchFn(`https://api.dataforseo.com/v3/${endpoint}`, {
		method: "POST",
		headers: {
			Authorization: authHeader(creds),
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`DataForSEO ${response.status}: ${text}`);
	}

	return response.json();
}

export interface RankedKeyword {
	keyword: string;
	position: number;
	searchVolume: number;
	url: string;
	competition: number;
	cpc: number;
}

export interface BacklinkSummary {
	totalBacklinks: number;
	referringDomains: number;
	rank: number;
	dofollow: number;
	nofollow: number;
}

export interface ReferringDomain {
	domain: string;
	backlinks: number;
	rank: number;
	firstSeen: string;
}

export interface BrokenBacklink {
	sourceUrl: string;
	sourceDomain: string;
	targetUrl: string;
	anchor: string;
}

export async function fetchRankedKeywords(
	ctx: PluginContext,
	domain: string,
): Promise<RankedKeyword[]> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "dataforseo_labs/google/ranked_keywords/live", [
		{
			target: domain,
			location_name: "United States",
			language_name: "English",
			limit: 1000,
		},
	]);

	const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
	return items.map((item: any) => ({
		keyword: item.keyword_data?.keyword ?? "",
		position: item.ranked_serp_element?.serp_item?.rank_absolute ?? 0,
		searchVolume: item.keyword_data?.keyword_info?.search_volume ?? 0,
		url: item.ranked_serp_element?.serp_item?.relative_url ?? "",
		competition: item.keyword_data?.keyword_info?.competition ?? 0,
		cpc: item.keyword_data?.keyword_info?.cpc ?? 0,
	}));
}

export async function fetchBacklinkSummary(
	ctx: PluginContext,
	domain: string,
): Promise<BacklinkSummary> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "backlinks/summary/live", [
		{ target: domain, internal_list_limit: 0, external_list_limit: 0 },
	]);

	const result = data?.tasks?.[0]?.result?.[0] ?? {};
	return {
		totalBacklinks: result.backlinks ?? 0,
		referringDomains: result.referring_domains ?? 0,
		rank: result.rank ?? 0,
		dofollow: result.backlinks_nofollow !== undefined
			? (result.backlinks ?? 0) - (result.backlinks_nofollow ?? 0)
			: 0,
		nofollow: result.backlinks_nofollow ?? 0,
	};
}

export async function fetchReferringDomains(
	ctx: PluginContext,
	domain: string,
): Promise<ReferringDomain[]> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "backlinks/referring_domains/live", [
		{ target: domain, limit: 500, order_by: ["rank,desc"] },
	]);

	const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
	return items.map((item: any) => ({
		domain: item.domain ?? "",
		backlinks: item.backlinks ?? 0,
		rank: item.rank ?? 0,
		firstSeen: item.first_seen ?? "",
	}));
}

export async function fetchBrokenBacklinks(
	ctx: PluginContext,
	domain: string,
): Promise<BrokenBacklink[]> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "backlinks/backlinks/live", [
		{
			target: domain,
			limit: 500,
			mode: "one_per_domain",
			filters: ["page_from_status_code", "=", 200, "AND", "page_to_status_code", "=", 404],
		},
	]);

	const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
	return items.map((item: any) => ({
		sourceUrl: item.url_from ?? "",
		sourceDomain: item.domain_from ?? "",
		targetUrl: item.url_to ?? "",
		anchor: item.anchor ?? "",
	}));
}

export interface DomainDataCache {
	rankedKeywords?: { data: RankedKeyword[]; fetchedAt: string };
	backlinkSummary?: { data: BacklinkSummary; fetchedAt: string };
	referringDomains?: { data: ReferringDomain[]; fetchedAt: string };
	brokenBacklinks?: { data: BrokenBacklink[]; fetchedAt: string };
}

function isStale(fetchedAt: string | undefined, maxAgeMs: number): boolean {
	if (!fetchedAt) return true;
	return Date.now() - new Date(fetchedAt).getTime() > maxAgeMs;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function refreshDomainData(
	ctx: PluginContext,
	domain: string,
): Promise<{ calls: number; errors: string[] }> {
	let calls = 0;
	const errors: string[] = [];

	const cached = await loadCachedDomainData(ctx);

	// Ranked keywords
	if (isStale(cached.rankedKeywords?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchRankedKeywords(ctx, domain);
			await ctx.storage.domain_data.put("ranked_keywords", {
				dataType: "ranked_keywords",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
		} catch (err) {
			errors.push(`Ranked keywords: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Backlink summary
	if (isStale(cached.backlinkSummary?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchBacklinkSummary(ctx, domain);
			await ctx.storage.domain_data.put("backlink_summary", {
				dataType: "backlink_summary",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
		} catch (err) {
			errors.push(`Backlink summary: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Referring domains
	if (isStale(cached.referringDomains?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchReferringDomains(ctx, domain);
			await ctx.storage.domain_data.put("referring_domains", {
				dataType: "referring_domains",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
		} catch (err) {
			errors.push(`Referring domains: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	// Broken backlinks
	if (isStale(cached.brokenBacklinks?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchBrokenBacklinks(ctx, domain);
			await ctx.storage.domain_data.put("broken_backlinks", {
				dataType: "broken_backlinks",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
		} catch (err) {
			errors.push(`Broken backlinks: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	return { calls, errors };
}

export async function loadCachedDomainData(ctx: PluginContext): Promise<DomainDataCache> {
	const cache: DomainDataCache = {};

	try {
		const rk = await ctx.storage.domain_data.get("ranked_keywords");
		if (rk) cache.rankedKeywords = { data: rk.data, fetchedAt: rk.fetchedAt };
	} catch {}

	try {
		const bs = await ctx.storage.domain_data.get("backlink_summary");
		if (bs) cache.backlinkSummary = { data: bs.data, fetchedAt: bs.fetchedAt };
	} catch {}

	try {
		const rd = await ctx.storage.domain_data.get("referring_domains");
		if (rd) cache.referringDomains = { data: rd.data, fetchedAt: rd.fetchedAt };
	} catch {}

	try {
		const bb = await ctx.storage.domain_data.get("broken_backlinks");
		if (bb) cache.brokenBacklinks = { data: bb.data, fetchedAt: bb.fetchedAt };
	} catch {}

	return cache;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/dataforseo.ts
git commit -m "feat: DataForSEO API client with batch calls and delta caching"
```

---

### Task 5: Content analysis engine

**Files:**
- Create: `packages/plugin-seo-toolkit/src/analysis.ts`

- [ ] **Step 1: Create `packages/plugin-seo-toolkit/src/analysis.ts`**

```typescript
import type { PluginContext } from "emdash";

export interface AnalysisCheck {
	pass: boolean;
	value?: number | string;
	detail?: string;
}

export interface AnalysisResult {
	entryId: string;
	collection: string;
	score: number;
	readabilityGrade: number;
	checks: Record<string, AnalysisCheck>;
	lastAnalysis: string;
}

function extractTextFromPortableText(blocks: any[]): string {
	if (!Array.isArray(blocks)) return "";
	const parts: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && Array.isArray(block.children)) {
			for (const child of block.children) {
				if (typeof child.text === "string") parts.push(child.text);
			}
		}
	}
	return parts.join(" ");
}

function extractParagraphs(blocks: any[]): string[] {
	if (!Array.isArray(blocks)) return [];
	const paragraphs: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && block.style === "normal" && Array.isArray(block.children)) {
			const text = block.children
				.filter((c: any) => typeof c.text === "string")
				.map((c: any) => c.text)
				.join("");
			if (text.trim()) paragraphs.push(text);
		}
	}
	return paragraphs;
}

function extractHeadings(blocks: any[]): string[] {
	if (!Array.isArray(blocks)) return [];
	const headings: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && typeof block.style === "string" && block.style.startsWith("h")) {
			headings.push(block.style);
		}
	}
	return headings;
}

function countSentences(text: string): number {
	return text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
}

function countWords(text: string): number {
	return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function countSyllables(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, "");
	if (w.length <= 3) return 1;
	let count = 0;
	const vowels = "aeiouy";
	let prevVowel = false;
	for (const ch of w) {
		const isVowel = vowels.includes(ch);
		if (isVowel && !prevVowel) count++;
		prevVowel = isVowel;
	}
	if (w.endsWith("e") && count > 1) count--;
	return Math.max(1, count);
}

function fleschKincaidGrade(text: string): number {
	const words = countWords(text);
	const sentences = countSentences(text);
	const syllables = text
		.split(/\s+/)
		.filter((w) => w.length > 0)
		.reduce((sum, w) => sum + countSyllables(w), 0);

	if (words === 0 || sentences === 0) return 0;

	return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

function findLinksInBlocks(blocks: any[], internal: boolean): number {
	if (!Array.isArray(blocks)) return 0;
	let count = 0;
	for (const block of blocks) {
		if (block._type === "block" && Array.isArray(block.markDefs)) {
			for (const mark of block.markDefs) {
				if (mark._type === "link" && typeof mark.href === "string") {
					const isInternal =
						mark.href.startsWith("/") || mark.href.includes("practicaltravelgear.com");
					if (internal === isInternal) count++;
				}
			}
		}
	}
	return count;
}

export async function analyzeContent(
	ctx: PluginContext,
	entry: any,
	collection: string,
): Promise<AnalysisResult> {
	const body = entry.data?.body ?? [];
	const bodyText = extractTextFromPortableText(body);
	const title: string = entry.data?.title ?? "";
	const checks: Record<string, AnalysisCheck> = {};

	// Readability
	const grade = fleschKincaidGrade(bodyText);
	checks.readability = {
		pass: grade >= 4 && grade <= 10,
		value: Math.round(grade * 10) / 10,
		detail: grade > 10 ? "Content may be too complex for web readers" : undefined,
	};

	// Sentence length
	const words = countWords(bodyText);
	const sentences = countSentences(bodyText);
	const avgSentenceLen = sentences > 0 ? Math.round(words / sentences) : 0;
	checks.sentence_length = {
		pass: avgSentenceLen <= 25,
		value: avgSentenceLen,
		detail: avgSentenceLen > 25 ? `Average ${avgSentenceLen} words/sentence (target: <25)` : undefined,
	};

	// Paragraph length
	const paragraphs = extractParagraphs(body);
	const longParagraphs = paragraphs.filter((p) => countWords(p) > 150).length;
	checks.paragraph_length = {
		pass: longParagraphs === 0,
		value: longParagraphs,
		detail: longParagraphs > 0 ? `${longParagraphs} paragraph(s) over 150 words` : undefined,
	};

	// Heading structure
	const headings = extractHeadings(body);
	const hasH2 = headings.includes("h2");
	const levels = headings.map((h) => parseInt(h.replace("h", ""), 10)).sort();
	let skippedLevel = false;
	for (let i = 1; i < levels.length; i++) {
		if (levels[i] - levels[i - 1] > 1) {
			skippedLevel = true;
			break;
		}
	}
	checks.heading_structure = {
		pass: hasH2 && !skippedLevel,
		detail: !hasH2
			? "No H2 heading found"
			: skippedLevel
				? "Skipped heading level (e.g., H1 to H3)"
				: undefined,
	};

	// Internal links
	const internalLinks = findLinksInBlocks(body, true);
	checks.internal_links = {
		pass: internalLinks > 0,
		value: internalLinks,
		detail: internalLinks === 0 ? "No internal links found" : undefined,
	};

	// External links
	const externalLinks = findLinksInBlocks(body, false);
	checks.external_links = {
		pass: externalLinks > 0,
		value: externalLinks,
		detail: externalLinks === 0 ? "No external links found" : undefined,
	};

	// Keyword checks — only if DataForSEO cache has data for this URL
	try {
		const cached = await ctx.storage.domain_data.get("ranked_keywords");
		if (cached?.data) {
			const slug = entry.slug ?? entry.id;
			const entryKeywords = (cached.data as any[]).filter(
				(kw: any) => kw.url && (kw.url.includes(`/${slug}`) || kw.url.endsWith(`/${slug}`)),
			);
			if (entryKeywords.length > 0) {
				// Use highest volume keyword as primary
				const primary = entryKeywords.sort((a: any, b: any) => b.searchVolume - a.searchVolume)[0];
				const keyword = primary.keyword.toLowerCase();

				// Keyword in title
				checks.keyword_in_title = {
					pass: title.toLowerCase().includes(keyword),
					value: primary.keyword,
					detail: !title.toLowerCase().includes(keyword)
						? `Primary keyword "${primary.keyword}" not in title`
						: undefined,
				};

				// Keyword in first paragraph
				const first100Words = bodyText.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
				checks.keyword_in_first_paragraph = {
					pass: first100Words.includes(keyword),
					value: primary.keyword,
					detail: !first100Words.includes(keyword)
						? `Primary keyword not in first 100 words`
						: undefined,
				};

				// Keyword density
				const bodyLower = bodyText.toLowerCase();
				const keywordCount = bodyLower.split(keyword).length - 1;
				const totalWords = countWords(bodyText);
				const density = totalWords > 0 ? (keywordCount / totalWords) * 100 : 0;
				const roundedDensity = Math.round(density * 100) / 100;
				checks.keyword_density = {
					pass: density >= 0.5 && density <= 3,
					value: `${roundedDensity}%`,
					detail:
						density < 0.5
							? `Keyword density ${roundedDensity}% is low (target: 0.5-3%)`
							: density > 3
								? `Keyword density ${roundedDensity}% is high (target: 0.5-3%)`
								: undefined,
				};
			}
		}
	} catch {
		// No keyword data available — skip keyword checks silently
	}

	// Calculate score
	const checkValues = Object.values(checks);
	const totalChecks = checkValues.length;
	const passedChecks = checkValues.filter((c) => c.pass).length;
	const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

	const result: AnalysisResult = {
		entryId: entry.id,
		collection,
		score,
		readabilityGrade: Math.round(grade * 10) / 10,
		checks,
		lastAnalysis: new Date().toISOString(),
	};

	await ctx.storage.analysis_scores.put(entry.id, result);
	return result;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/analysis.ts
git commit -m "feat: on-save content analysis with readability and keyword scoring"
```

---

### Task 6: Admin pages — settings

**Files:**
- Create: `packages/plugin-seo-toolkit/src/admin-settings.ts`

- [ ] **Step 1: Create `packages/plugin-seo-toolkit/src/admin-settings.ts`**

```typescript
import type { PluginContext } from "emdash";

export async function buildSettingsPage(ctx: PluginContext) {
	const login = (await ctx.kv.get<string>("settings:dataforseoLogin")) ?? "";
	const domain = (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
	const autoRefresh = (await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
	const lastRefresh = await ctx.kv.get<string>("settings:lastRefresh");

	return {
		blocks: [
			{ type: "header", text: "SEO Settings" },
			{ type: "divider" },
			{
				type: "form",
				block_id: "seo-settings",
				fields: [
					{
						type: "text_input",
						action_id: "dataforseoLogin",
						label: "DataForSEO Login (email)",
						initial_value: login,
					},
					{
						type: "secret_input",
						action_id: "dataforseoPassword",
						label: "DataForSEO Password",
					},
					{
						type: "text_input",
						action_id: "domain",
						label: "Target Domain",
						initial_value: domain,
					},
					{
						type: "toggle",
						action_id: "autoRefresh",
						label: "Weekly Auto-Refresh",
						initial_value: autoRefresh,
					},
				],
				submit: { label: "Save Settings", action_id: "save_seo_settings" },
			},
			{ type: "divider" },
			{
				type: "fields",
				fields: [
					{ label: "Status", value: login ? "Configured" : "Not Configured" },
					{ label: "Domain", value: domain },
					{ label: "Last Refresh", value: lastRefresh ?? "Never" },
				],
			},
			{ type: "divider" },
			{
				type: "actions",
				elements: [
					{
						type: "button",
						text: "Refresh Data Now",
						action_id: "refresh_data",
						style: "primary",
					},
					{
						type: "button",
						text: "Run Content Audit",
						action_id: "run_audit",
					},
				],
			},
		],
	};
}

export async function saveSettings(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	if (typeof values.dataforseoLogin === "string" && values.dataforseoLogin.trim())
		await ctx.kv.set("settings:dataforseoLogin", values.dataforseoLogin.trim());
	if (typeof values.dataforseoPassword === "string" && values.dataforseoPassword !== "")
		await ctx.kv.set("settings:dataforseoPassword", values.dataforseoPassword);
	if (typeof values.domain === "string" && values.domain.trim())
		await ctx.kv.set("settings:domain", values.domain.trim());
	if (typeof values.autoRefresh === "boolean")
		await ctx.kv.set("settings:autoRefresh", values.autoRefresh);

	return {
		...(await buildSettingsPage(ctx)),
		toast: { message: "Settings saved", type: "success" as const },
	};
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-settings.ts
git commit -m "feat: SEO settings admin page with DataForSEO credentials"
```

---

### Task 7: Admin pages — dashboard

**Files:**
- Create: `packages/plugin-seo-toolkit/src/admin-dashboard.ts`

- [ ] **Step 1: Create `packages/plugin-seo-toolkit/src/admin-dashboard.ts`**

```typescript
import type { PluginContext } from "emdash";
import type { AuditResult } from "./audit.js";

function trafficLight(score: number): string {
	if (score >= 90) return "🟢";
	if (score >= 70) return "🟡";
	return "🔴";
}

export async function buildDashboardPage(ctx: PluginContext) {
	// Load all audit results from storage
	const auditData = await ctx.storage.audit_results.query({
		orderBy: { score: "asc" },
		limit: 200,
	});

	const results: AuditResult[] = auditData.items.map((item: any) => item.data ?? item);

	if (results.length === 0) {
		return {
			blocks: [
				{ type: "header", text: "SEO Dashboard" },
				{
					type: "context",
					text: "No audit data yet. Go to SEO Settings and click **Run Content Audit** to scan your content.",
				},
			],
		};
	}

	// Calculate site-wide score
	const totalScore = results.reduce((sum, r) => sum + r.score, 0);
	const avgScore = Math.round(totalScore / results.length);

	// Count issues by type
	const issueCounts: Record<string, number> = {};
	for (const result of results) {
		for (const issue of result.issues) {
			issueCounts[issue.check] = (issueCounts[issue.check] ?? 0) + 1;
		}
	}

	const issueRows = Object.entries(issueCounts)
		.sort(([, a], [, b]) => b - a)
		.map(([check, count]) => ({
			check: check.replace(/_/g, " "),
			count: String(count),
		}));

	// Entry table (worst first)
	const entryRows = results.slice(0, 50).map((r) => ({
		title: r.title,
		collection: r.collection,
		score: `${trafficLight(r.score)} ${r.score}`,
		issues: String(r.issues.length),
	}));

	return {
		blocks: [
			{ type: "header", text: "SEO Dashboard" },
			{
				type: "stats",
				stats: [
					{ label: "Site Health", value: `${trafficLight(avgScore)} ${avgScore}/100` },
					{ label: "Entries Scanned", value: String(results.length) },
					{
						label: "Issues Found",
						value: String(results.reduce((sum, r) => sum + r.issues.length, 0)),
					},
				],
			},
			{ type: "divider" },
			{ type: "section", text: "**Issues by Type**" },
			{
				type: "table",
				blockId: "issue-breakdown",
				columns: [
					{ key: "check", label: "Issue", format: "text" },
					{ key: "count", label: "Count", format: "text" },
				],
				rows: issueRows,
			},
			{ type: "divider" },
			{ type: "section", text: "**Content Scores** (worst first)" },
			{
				type: "table",
				blockId: "entry-scores",
				columns: [
					{ key: "title", label: "Title", format: "text" },
					{ key: "collection", label: "Collection", format: "text" },
					{ key: "score", label: "Score", format: "text" },
					{ key: "issues", label: "Issues", format: "text" },
				],
				rows: entryRows,
			},
		],
	};
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-dashboard.ts
git commit -m "feat: SEO dashboard with health score, issue breakdown, entry table"
```

---

### Task 8: Admin pages — rankings

**Files:**
- Create: `packages/plugin-seo-toolkit/src/admin-rankings.ts`

- [ ] **Step 1: Create `packages/plugin-seo-toolkit/src/admin-rankings.ts`**

```typescript
import type { PluginContext } from "emdash";
import { loadCachedDomainData } from "./dataforseo.js";

export async function buildRankingsPage(ctx: PluginContext) {
	const cached = await loadCachedDomainData(ctx);

	if (!cached.rankedKeywords?.data?.length) {
		return {
			blocks: [
				{ type: "header", text: "Rankings" },
				{
					type: "context",
					text: "No ranking data yet. Configure DataForSEO credentials in **SEO Settings** and click **Refresh Data Now**.",
				},
			],
		};
	}

	const keywords = cached.rankedKeywords.data
		.sort((a, b) => b.searchVolume - a.searchVolume)
		.slice(0, 100);

	const rows = keywords.map((kw) => ({
		keyword: kw.keyword,
		position: String(kw.position),
		volume: String(kw.searchVolume),
		url: kw.url,
		cpc: `$${kw.cpc.toFixed(2)}`,
	}));

	return {
		blocks: [
			{ type: "header", text: "Rankings" },
			{
				type: "context",
				text: `Showing top ${rows.length} keywords by search volume. Last updated: ${cached.rankedKeywords.fetchedAt ?? "unknown"}`,
			},
			{
				type: "stats",
				stats: [
					{ label: "Tracked Keywords", value: String(cached.rankedKeywords.data.length) },
					{ label: "Top 10 Keywords", value: String(cached.rankedKeywords.data.filter((k) => k.position <= 10).length) },
					{ label: "Top 3 Keywords", value: String(cached.rankedKeywords.data.filter((k) => k.position <= 3).length) },
				],
			},
			{ type: "divider" },
			{
				type: "table",
				blockId: "rankings-table",
				columns: [
					{ key: "keyword", label: "Keyword", format: "text" },
					{ key: "position", label: "Position", format: "text" },
					{ key: "volume", label: "Search Volume", format: "text" },
					{ key: "url", label: "URL", format: "text" },
					{ key: "cpc", label: "CPC", format: "text" },
				],
				rows,
			},
		],
	};
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-rankings.ts
git commit -m "feat: rankings admin page with keyword position and volume data"
```

---

### Task 9: Admin pages — backlinks

**Files:**
- Create: `packages/plugin-seo-toolkit/src/admin-backlinks.ts`

- [ ] **Step 1: Create `packages/plugin-seo-toolkit/src/admin-backlinks.ts`**

```typescript
import type { PluginContext } from "emdash";
import { loadCachedDomainData } from "./dataforseo.js";

export async function buildBacklinksPage(ctx: PluginContext) {
	const cached = await loadCachedDomainData(ctx);

	if (!cached.backlinkSummary?.data) {
		return {
			blocks: [
				{ type: "header", text: "Backlinks" },
				{
					type: "context",
					text: "No backlink data yet. Configure DataForSEO credentials in **SEO Settings** and click **Refresh Data Now**.",
				},
			],
		};
	}

	const summary = cached.backlinkSummary.data;
	const domains = cached.referringDomains?.data ?? [];
	const broken = cached.brokenBacklinks?.data ?? [];

	const domainRows = domains.slice(0, 50).map((d) => ({
		domain: d.domain,
		backlinks: String(d.backlinks),
		rank: String(d.rank),
	}));

	const brokenRows = broken.slice(0, 50).map((b) => ({
		deadUrl: b.targetUrl,
		source: b.sourceDomain,
		sourceUrl: b.sourceUrl,
		anchor: b.anchor,
	}));

	const blocks: any[] = [
		{ type: "header", text: "Backlinks" },
		{
			type: "context",
			text: `Last updated: ${cached.backlinkSummary.fetchedAt ?? "unknown"}`,
		},
		{
			type: "stats",
			stats: [
				{ label: "Total Backlinks", value: String(summary.totalBacklinks) },
				{ label: "Referring Domains", value: String(summary.referringDomains) },
				{ label: "Domain Rank", value: String(summary.rank) },
				{ label: "Dofollow", value: String(summary.dofollow) },
			],
		},
		{ type: "divider" },
		{ type: "section", text: "**Top Referring Domains**" },
		{
			type: "table",
			blockId: "referring-domains",
			columns: [
				{ key: "domain", label: "Domain", format: "text" },
				{ key: "backlinks", label: "Backlinks", format: "text" },
				{ key: "rank", label: "Rank", format: "text" },
			],
			rows: domainRows,
		},
	];

	if (brokenRows.length > 0) {
		blocks.push(
			{ type: "divider" },
			{
				type: "section",
				text: `**Broken Inbound Links** (${broken.length} found — set up redirects for these)`,
			},
			{
				type: "table",
				blockId: "broken-backlinks",
				columns: [
					{ key: "deadUrl", label: "Dead URL (Your Site)", format: "text" },
					{ key: "source", label: "Linking Domain", format: "text" },
					{ key: "anchor", label: "Anchor Text", format: "text" },
				],
				rows: brokenRows,
			},
		);
	}

	return { blocks };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-backlinks.ts
git commit -m "feat: backlinks admin page with domain stats and broken link detection"
```

---

### Task 10: Wire everything into sandbox-entry.ts

**Files:**
- Modify: `packages/plugin-seo-toolkit/src/sandbox-entry.ts`

- [ ] **Step 1: Rewrite `sandbox-entry.ts` to connect all subsystems**

```typescript
import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { runAudit } from "./audit.js";
import { refreshDomainData } from "./dataforseo.js";
import { analyzeContent } from "./analysis.js";
import { buildDashboardPage } from "./admin-dashboard.js";
import { buildRankingsPage } from "./admin-rankings.js";
import { buildBacklinksPage } from "./admin-backlinks.js";
import { buildSettingsPage, saveSettings } from "./admin-settings.js";

async function getDomain(ctx: PluginContext): Promise<string> {
	return (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
}

export default definePlugin({
	hooks: {
		"content:afterSave": {
			priority: 200,
			timeout: 15000,
			errorPolicy: "continue",
			handler: async (event: any, ctx: PluginContext) => {
				try {
					await analyzeContent(ctx, event.content, event.collection);
				} catch (err) {
					ctx.log.warn("SEO analysis failed", err);
				}
			},
		},

		cron: {
			handler: async (_event: any, ctx: PluginContext) => {
				const autoRefresh = (await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
				if (!autoRefresh) return;

				const domain = await getDomain(ctx);
				ctx.log.info("SEO weekly refresh starting", { domain });

				// Refresh DataForSEO data
				const { calls, errors } = await refreshDomainData(ctx, domain);
				if (errors.length > 0) {
					ctx.log.warn("DataForSEO refresh had errors", { errors });
				}
				ctx.log.info(`DataForSEO refresh complete: ${calls} API calls`);

				// Run content audit
				const results = await runAudit(ctx);
				ctx.log.info(`Content audit complete: ${results.length} entries scanned`);

				await ctx.kv.set("settings:lastRefresh", new Date().toISOString());
			},
		},
	},

	routes: {
		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = routeCtx.input;

				// Page loads
				if (interaction.type === "page_load") {
					switch (interaction.page) {
						case "/dashboard":
							return buildDashboardPage(ctx);
						case "/rankings":
							return buildRankingsPage(ctx);
						case "/backlinks":
							return buildBacklinksPage(ctx);
						case "/settings":
							return buildSettingsPage(ctx);
						default:
							return buildDashboardPage(ctx);
					}
				}

				// Form submissions
				if (interaction.type === "form_submit") {
					if (interaction.action_id === "save_seo_settings") {
						return saveSettings(ctx, interaction.values ?? {});
					}
				}

				// Button actions
				if (interaction.type === "block_action") {
					if (interaction.action_id === "refresh_data") {
						const domain = await getDomain(ctx);
						try {
							const { calls, errors } = await refreshDomainData(ctx, domain);
							await ctx.kv.set("settings:lastRefresh", new Date().toISOString());
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: errors.length > 0
										? `Refreshed with ${errors.length} error(s): ${errors[0]}`
										: `Data refreshed (${calls} API calls)`,
									type: errors.length > 0 ? ("warning" as const) : ("success" as const),
								},
							};
						} catch (err) {
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
									type: "error" as const,
								},
							};
						}
					}

					if (interaction.action_id === "run_audit") {
						try {
							const results = await runAudit(ctx);
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: `Audit complete: ${results.length} entries scanned`,
									type: "success" as const,
								},
							};
						} catch (err) {
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: `Audit failed: ${err instanceof Error ? err.message : String(err)}`,
									type: "error" as const,
								},
							};
						}
					}
				}

				return { blocks: [] };
			},
		},
	},
});
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/sandbox-entry.ts
git commit -m "feat: wire all SEO subsystems into plugin entry — hooks, routes, admin"
```

---

### Task 11: Build, deploy, and verify

- [ ] **Step 1: Install dependencies**

```bash
npm install --legacy-peer-deps
```

- [ ] **Step 2: Type check**

```bash
npm run typecheck
```

Expected: no errors from the plugin.

- [ ] **Step 3: Build**

```bash
npm run build
```

Expected: clean build.

- [ ] **Step 4: Deploy**

```bash
npm run deploy
```

- [ ] **Step 5: Configure in production admin**

Open admin, navigate to SEO Settings:
- Enter DataForSEO login and password
- Confirm domain is `practicaltravelgear.com`
- Enable weekly auto-refresh
- Click "Refresh Data Now"
- Click "Run Content Audit"

- [ ] **Step 6: Verify dashboard, rankings, and backlinks pages populate**

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: seo-toolkit plugin — audit, DataForSEO, content analysis"
```
