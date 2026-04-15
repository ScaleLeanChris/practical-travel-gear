# SEO Plugin Consolidation & Enhancement — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate the SEO toolkit plugin's 4 admin pages into a single tabbed interface, relocate action buttons, add ranking history with trends, restructure backlinks into sub-tabs, and upgrade all pages to native Block Kit primitives.

**Architecture:** Single admin page with button-row tabs dispatching to tab builder functions. New `ranking_history` storage table for 12-week trend data. New `fetchIndividualBacklinks()` DataForSEO call. All existing page builders refactored to return `Block[]` arrays (tab content) instead of `{ blocks }` responses.

**Tech Stack:** TypeScript, EmDash plugin SDK (standard format), Block Kit (stats, chart, banner, table, actions, form), DataForSEO v3 API.

**Spec:** `docs/superpowers/specs/2026-04-14-seo-plugin-consolidation-design.md`

---

## File Structure

All files are in `packages/plugin-seo-toolkit/src/`.

| File | Change | Responsibility |
|------|--------|----------------|
| `index.ts` | Modify | Descriptor: 1 admin page, add `ranking_history` storage table |
| `sandbox-entry.ts` | Rewrite | Route handler: tab/sub-tab state machine, action dispatch |
| `admin-dashboard.ts` | Modify | Dashboard tab builder: `stats` blocks, `banner` empty states |
| `admin-rankings.ts` | Rewrite | Rankings tab builder: delta column, trend chart, fetch button |
| `admin-backlinks.ts` | Rewrite | Backlinks tab builder: 3 sub-tab builders, individual links |
| `admin-settings.ts` | Modify | Settings tab builder: remove action buttons, keep form only |
| `admin-tab-bar.ts` | Create | Shared tab bar and sub-tab bar builders |
| `dataforseo.ts` | Modify | Add `fetchIndividualBacklinks()`, ranking history write/read/prune |

`admin-tab-bar.ts` is a new file to keep the tab bar logic DRY — it's used by `sandbox-entry.ts` and all tab builders reference it for consistent styling.

---

### Task 1: Plugin Descriptor — Single Admin Page + New Storage Table

**Files:**
- Modify: `packages/plugin-seo-toolkit/src/index.ts`

- [ ] **Step 1: Update `adminPages` to single entry**

Replace the entire `adminPages` array in `index.ts`:

```typescript
// Replace lines 23-28
adminPages: [
  { path: "/seo", label: "SEO", icon: "bar-chart" },
],
```

- [ ] **Step 2: Add `ranking_history` storage table**

Add to the `storage` object in `index.ts`, after the existing `analysis_scores` entry:

```typescript
ranking_history: {
  indexes: ["keyword", "fetchedAt"],
},
```

- [ ] **Step 3: Verify the full descriptor**

The complete `index.ts` should now be:

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
      ranking_history: {
        indexes: ["keyword", "fetchedAt"],
      },
    },
    adminPages: [
      { path: "/seo", label: "SEO", icon: "bar-chart" },
    ],
  };
}
```

- [ ] **Step 4: Commit**

```bash
git add packages/plugin-seo-toolkit/src/index.ts
git commit -m "feat(seo): consolidate to single admin page, add ranking_history table"
```

---

### Task 2: Tab Bar Builder

**Files:**
- Create: `packages/plugin-seo-toolkit/src/admin-tab-bar.ts`

- [ ] **Step 1: Create the tab bar builder module**

```typescript
export type Tab = "dashboard" | "rankings" | "backlinks" | "settings";
export type BacklinksSubTab = "domains" | "links" | "broken";

const TAB_CONFIG: Array<{ id: Tab; label: string }> = [
  { id: "dashboard", label: "Dashboard" },
  { id: "rankings", label: "Rankings" },
  { id: "backlinks", label: "Backlinks" },
  { id: "settings", label: "Settings" },
];

const SUBTAB_CONFIG: Array<{ id: BacklinksSubTab; label: string }> = [
  { id: "domains", label: "Referring Domains" },
  { id: "links", label: "Individual Links" },
  { id: "broken", label: "Broken Links" },
];

export function buildTabBar(activeTab: Tab): any {
  return {
    type: "actions",
    elements: TAB_CONFIG.map((tab) => ({
      type: "button",
      label: tab.label,
      action_id: `tab:${tab.id}`,
      style: activeTab === tab.id ? "primary" : "default",
    })),
  };
}

export function buildSubTabBar(activeSubTab: BacklinksSubTab): any {
  return {
    type: "actions",
    elements: SUBTAB_CONFIG.map((sub) => ({
      type: "button",
      label: sub.label,
      action_id: `subtab:${sub.id}`,
      style: activeSubTab === sub.id ? "primary" : "default",
    })),
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-tab-bar.ts
git commit -m "feat(seo): add tab bar and sub-tab bar builders"
```

---

### Task 3: Settings Tab — Remove Action Buttons

**Files:**
- Modify: `packages/plugin-seo-toolkit/src/admin-settings.ts`

- [ ] **Step 1: Rewrite `buildSettingsPage` to return `Block[]` without action buttons**

Replace the entire contents of `admin-settings.ts`:

```typescript
import type { PluginContext } from "emdash";

export async function buildSettingsTab(ctx: PluginContext): Promise<any[]> {
  const login = (await ctx.kv.get<string>("settings:dataforseoLogin")) ?? "";
  const domain = (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
  const autoRefresh = (await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
  const lastRefresh = await ctx.kv.get<string>("settings:lastRefresh");
  const hasPassword = !!(await ctx.kv.get<string>("settings:dataforseoPassword"));

  return [
    { type: "header", text: "Settings" },
    {
      type: "context",
      text: "Connect your DataForSEO account to track keyword rankings, backlinks, and broken inbound links.",
    },
    { type: "divider" },
    {
      type: "form",
      block_id: "seo-settings",
      fields: [
        {
          type: "text_input",
          action_id: "dataforseoLogin",
          label: "DataForSEO Login Email",
          initial_value: login,
          placeholder: "you@example.com",
        },
        {
          type: "secret_input",
          action_id: "dataforseoPassword",
          label: hasPassword ? "DataForSEO API Password (saved)" : "DataForSEO API Password",
          placeholder: hasPassword ? "Password saved \u2014 leave blank to keep" : "From app.dataforseo.com dashboard",
        },
        {
          type: "text_input",
          action_id: "domain",
          label: "Your Domain (what DataForSEO tracks)",
          initial_value: domain,
          placeholder: "example.com",
        },
        {
          type: "toggle",
          action_id: "autoRefresh",
          label: "Auto-refresh data weekly (rankings, backlinks, audit)",
          initial_value: autoRefresh,
        },
      ],
      submit: { label: "Save Settings", action_id: "save_seo_settings" },
    },
    { type: "divider" },
    {
      type: "stats",
      stats: [
        { label: "Status", value: login ? "Configured" : "Not Configured" },
        { label: "Domain", value: domain },
        { label: "Last Refresh", value: lastRefresh ?? "Never" },
      ],
    },
  ];
}

export async function saveSettings(
  ctx: PluginContext,
  values: Record<string, unknown>,
): Promise<void> {
  if (typeof values.dataforseoLogin === "string" && values.dataforseoLogin.trim())
    await ctx.kv.set("settings:dataforseoLogin", values.dataforseoLogin.trim());
  if (typeof values.dataforseoPassword === "string" && values.dataforseoPassword !== "")
    await ctx.kv.set("settings:dataforseoPassword", values.dataforseoPassword);
  if (typeof values.domain === "string" && values.domain.trim())
    await ctx.kv.set("settings:domain", values.domain.trim());
  if (typeof values.autoRefresh === "boolean")
    await ctx.kv.set("settings:autoRefresh", values.autoRefresh);
}
```

Key changes from current code:
- Function renamed `buildSettingsPage` -> `buildSettingsTab`, returns `any[]` (block array) not `{ blocks }`
- Removed the "Actions" section (header, context, and actions block with refresh_data/run_audit buttons)
- Replaced `fields` block with `stats` block for status info
- `saveSettings` no longer returns a response — the route handler composes the response

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-settings.ts
git commit -m "feat(seo): settings tab returns Block[], removes action buttons"
```

---

### Task 4: Dashboard Tab — Upgrade to Native Block Kit

**Files:**
- Modify: `packages/plugin-seo-toolkit/src/admin-dashboard.ts`

- [ ] **Step 1: Rewrite dashboard to return `Block[]` with `stats`, `banner`, and audit button**

Replace the entire contents of `admin-dashboard.ts`:

```typescript
import type { PluginContext } from "emdash";
import type { AuditResult } from "./audit.js";

export async function buildDashboardTab(ctx: PluginContext): Promise<any[]> {
  // Check credentials
  const login = await ctx.kv.get<string>("settings:dataforseoLogin");
  const hasCredentials = !!login;

  let results: AuditResult[] = [];
  try {
    const auditData: any = await ctx.storage.audit_results.query({
      limit: 200,
    });
    const items: any[] = auditData?.items ?? [];
    results = items
      .map((item: any) => {
        const r = item?.data ?? item;
        return {
          entryId: r?.entryId ?? "",
          collection: r?.collection ?? "",
          slug: r?.slug ?? "",
          title: r?.title ?? "(untitled)",
          score: typeof r?.score === "number" ? r.score : 0,
          issues: Array.isArray(r?.issues) ? r.issues : [],
          lastAudit: r?.lastAudit ?? "",
        } as AuditResult;
      })
      .sort((a, b) => a.score - b.score);
  } catch {
    // Storage may not have data yet
  }

  const blocks: any[] = [{ type: "header", text: "Dashboard" }];

  if (!hasCredentials) {
    blocks.push({
      type: "banner",
      title: "DataForSEO not configured",
      description: "Go to the Settings tab to add your DataForSEO credentials.",
      variant: "default",
    });
  }

  // Audit action button
  blocks.push({
    type: "actions",
    elements: [
      {
        type: "button",
        label: "Run Content Audit",
        action_id: "run_audit",
        style: "primary",
      },
    ],
  });

  if (results.length === 0) {
    blocks.push({
      type: "banner",
      title: "No audit data",
      description: "Run a content audit to see your SEO scores.",
      variant: "default",
    });
    return blocks;
  }

  const totalScore = results.reduce((sum, r) => sum + r.score, 0);
  const avgScore = Math.round(totalScore / results.length);
  const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);

  // Load previous audit summary for trend
  const prevSummary = await ctx.kv.get<{ avgScore: number; totalIssues: number; count: number }>("prev_audit_summary");

  const scoreTrend = prevSummary
    ? `${avgScore >= prevSummary.avgScore ? "+" : ""}${avgScore - prevSummary.avgScore}`
    : undefined;
  const issueTrend = prevSummary
    ? `${totalIssues <= prevSummary.totalIssues ? "" : "+"}${totalIssues - prevSummary.totalIssues}`
    : undefined;

  blocks.push({
    type: "stats",
    stats: [
      {
        label: "Site Health",
        value: `${avgScore}/100`,
        ...(scoreTrend ? { trend: scoreTrend, trend_direction: avgScore >= (prevSummary?.avgScore ?? 0) ? "up" : "down" } : {}),
      },
      { label: "Entries Scanned", value: String(results.length) },
      {
        label: "Issues Found",
        value: String(totalIssues),
        ...(issueTrend ? { trend: issueTrend, trend_direction: totalIssues <= (prevSummary?.totalIssues ?? 0) ? "up" : "down" } : {}),
      },
    ],
  });

  // Issue breakdown
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

  if (issueRows.length > 0) {
    blocks.push(
      { type: "divider" },
      { type: "header", text: "Issues by Type" },
      {
        type: "table",
        blockId: "issue-breakdown",
        columns: [
          { key: "check", label: "Issue", format: "text" },
          { key: "count", label: "Count", format: "text" },
        ],
        rows: issueRows,
      },
    );
  }

  // Entry scores table
  const entryRows = results.slice(0, 50).map((r) => ({
    title: r.title,
    collection: r.collection,
    score: String(r.score),
    issues: String(r.issues.length),
  }));

  if (entryRows.length > 0) {
    blocks.push(
      { type: "divider" },
      { type: "header", text: "Content Scores (worst first)" },
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
    );
  }

  return blocks;
}
```

Key changes:
- Returns `any[]` not `{ blocks }`, renamed to `buildDashboardTab`
- `fields` replaced with `stats` including trend data from `prev_audit_summary` KV
- Empty states use `banner` blocks
- "Run Content Audit" button moved here from settings
- Credential check with `banner` prompt
- Removed emoji traffic lights from score column (plain number)

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-dashboard.ts
git commit -m "feat(seo): dashboard tab with stats trends, banner states, audit button"
```

---

### Task 5: DataForSEO — Individual Backlinks + Ranking History

**Files:**
- Modify: `packages/plugin-seo-toolkit/src/dataforseo.ts`

- [ ] **Step 1: Add `IndividualBacklink` interface and `fetchIndividualBacklinks` function**

Add after the `BrokenBacklink` interface (after line 73):

```typescript
export interface IndividualBacklink {
  urlFrom: string;
  domainFrom: string;
  urlTo: string;
  anchor: string;
  dofollow: boolean;
  isBroken: boolean;
  redirectUrl: string | null;
}
```

Add after `fetchBrokenBacklinks` function (after line 169):

```typescript
export async function fetchIndividualBacklinks(
  ctx: PluginContext,
  domain: string,
): Promise<IndividualBacklink[]> {
  const creds = await getCredentials(ctx);
  if (!creds) throw new Error("DataForSEO credentials not configured");

  const data = await apiCall(ctx, creds, "backlinks/backlinks/live", [
    {
      target: domain,
      limit: 1000,
      order_by: ["rank,desc"],
    },
  ]);

  const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
  return items.map((item: any) => ({
    urlFrom: item.url_from ?? "",
    domainFrom: item.domain_from ?? "",
    urlTo: item.url_to ?? "",
    anchor: item.anchor ?? "",
    dofollow: item.dofollow ?? false,
    isBroken: item.is_broken ?? false,
    redirectUrl: item.url_to_redirect_target ?? null,
  }));
}
```

- [ ] **Step 2: Update `DomainDataCache` interface**

Add `individualBacklinks` to the interface (after line 175):

```typescript
export interface DomainDataCache {
  rankedKeywords?: { data: RankedKeyword[]; fetchedAt: string };
  backlinkSummary?: { data: BacklinkSummary; fetchedAt: string };
  referringDomains?: { data: ReferringDomain[]; fetchedAt: string };
  brokenBacklinks?: { data: BrokenBacklink[]; fetchedAt: string };
  individualBacklinks?: { data: IndividualBacklink[]; fetchedAt: string };
}
```

- [ ] **Step 3: Add individual backlinks fetch + prev_backlink_summary to `refreshDomainData`**

Add after the broken backlinks fetch block (after line 247, before `return { calls, errors }`):

```typescript
  if (isStale(cached.individualBacklinks?.fetchedAt, ONE_DAY_MS)) {
    try {
      const data = await fetchIndividualBacklinks(ctx, domain);
      await ctx.storage.domain_data.put("individual_backlinks", {
        dataType: "individual_backlinks",
        data,
        fetchedAt: new Date().toISOString(),
      });
      calls++;
    } catch (err) {
      errors.push(`Individual backlinks: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
```

Also, add prev_backlink_summary saving. Insert at the start of `refreshDomainData`, right after `const cached = await loadCachedDomainData(ctx);` (line 191):

```typescript
  // Save previous backlink summary for trend comparison
  if (cached.backlinkSummary?.data) {
    await ctx.kv.set("prev_backlink_summary", cached.backlinkSummary.data);
  }
```

- [ ] **Step 4: Add ranking history write + prune to `refreshDomainData`**

Add after the ranked keywords fetch block (after line 204, after `calls++;`). Insert inside the `try` block, right after the `ctx.storage.domain_data.put("ranked_keywords", ...)` call:

```typescript
        // Write ranking history snapshots
        const today = new Date().toISOString().slice(0, 10);
        for (const kw of data) {
          await ctx.storage.ranking_history.put(`${kw.keyword}:${today}`, {
            keyword: kw.keyword,
            position: kw.position,
            searchVolume: kw.searchVolume,
            url: kw.url,
            competition: kw.competition,
            cpc: kw.cpc,
            fetchedAt: today,
          });
        }
        // Prune records older than 84 days
        const cutoff = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
        try {
          const old: any = await ctx.storage.ranking_history.query({
            where: { fetchedAt: { lt: cutoff } },
            limit: 5000,
          });
          for (const item of old?.items ?? []) {
            await ctx.storage.ranking_history.delete(item.id ?? item.key);
          }
        } catch {
          // Prune is best-effort
        }
```

- [ ] **Step 5: Add individual backlinks to `loadCachedDomainData`**

Add after the broken backlinks load block (before `return cache;`):

```typescript
  try {
    const ib = unwrap(await ctx.storage.domain_data.get("individual_backlinks"));
    if (ib?.data) cache.individualBacklinks = { data: ib.data, fetchedAt: ib.fetchedAt };
  } catch {}
```

- [ ] **Step 6: Add ranking history query helpers**

Add at the end of the file, after `loadCachedDomainData`:

```typescript
export interface RankingSnapshot {
  keyword: string;
  position: number;
  searchVolume: number;
  url: string;
  competition: number;
  cpc: number;
  fetchedAt: string;
}

export async function loadRankingHistory(
  ctx: PluginContext,
  keyword: string,
): Promise<RankingSnapshot[]> {
  try {
    const result: any = await ctx.storage.ranking_history.query({
      where: { keyword },
      limit: 100,
    });
    return (result?.items ?? []).map((item: any) => {
      const d = item?.data ?? item;
      return {
        keyword: d.keyword ?? keyword,
        position: d.position ?? 0,
        searchVolume: d.searchVolume ?? 0,
        url: d.url ?? "",
        competition: d.competition ?? 0,
        cpc: d.cpc ?? 0,
        fetchedAt: d.fetchedAt ?? "",
      } as RankingSnapshot;
    }).sort((a: RankingSnapshot, b: RankingSnapshot) => a.fetchedAt.localeCompare(b.fetchedAt));
  } catch {
    return [];
  }
}

export async function loadPreviousWeekRanking(
  ctx: PluginContext,
  keyword: string,
): Promise<RankingSnapshot | null> {
  const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  try {
    const raw = await ctx.storage.ranking_history.get(`${keyword}:${lastWeek}`);
    const d = raw?.data ?? raw;
    if (!d?.position) return null;
    return {
      keyword: d.keyword ?? keyword,
      position: d.position,
      searchVolume: d.searchVolume ?? 0,
      url: d.url ?? "",
      competition: d.competition ?? 0,
      cpc: d.cpc ?? 0,
      fetchedAt: d.fetchedAt ?? lastWeek,
    };
  } catch {
    return null;
  }
}
```

- [ ] **Step 7: Commit**

```bash
git add packages/plugin-seo-toolkit/src/dataforseo.ts
git commit -m "feat(seo): individual backlinks fetch, ranking history write/read/prune"
```

---

### Task 6: Rankings Tab — Delta Column + Trend Chart

**Files:**
- Modify: `packages/plugin-seo-toolkit/src/admin-rankings.ts`

- [ ] **Step 1: Rewrite rankings tab with delta column and trend chart**

Replace the entire contents of `admin-rankings.ts`:

```typescript
import type { PluginContext } from "emdash";
import {
  loadCachedDomainData,
  loadPreviousWeekRanking,
  loadRankingHistory,
} from "./dataforseo.js";

export async function buildRankingsTab(ctx: PluginContext): Promise<any[]> {
  // Check credentials
  const login = await ctx.kv.get<string>("settings:dataforseoLogin");
  if (!login) {
    return [
      { type: "header", text: "Rankings" },
      {
        type: "banner",
        title: "DataForSEO not configured",
        description: "Go to the Settings tab to add your DataForSEO credentials.",
        variant: "default",
      },
    ];
  }

  let cached;
  try {
    cached = await loadCachedDomainData(ctx);
  } catch {
    cached = {};
  }

  const keywords = Array.isArray(cached.rankedKeywords?.data)
    ? cached.rankedKeywords!.data
    : [];

  const blocks: any[] = [
    { type: "header", text: "Rankings" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Fetch Rankings",
          action_id: "refresh_data:rankings",
          style: "primary",
        },
      ],
    },
  ];

  if (keywords.length === 0) {
    blocks.push({
      type: "banner",
      title: "No ranking data",
      description: "Click Fetch Rankings to pull your keyword positions from DataForSEO.",
      variant: "default",
    });
    return blocks;
  }

  const sorted = [...keywords]
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, 100);

  // Load previous week rankings for delta
  const deltas = new Map<string, number | null>();
  for (const kw of sorted) {
    const prev = await loadPreviousWeekRanking(ctx, kw.keyword);
    deltas.set(kw.keyword, prev ? prev.position - kw.position : null);
  }

  const rows = sorted.map((kw) => {
    const delta = deltas.get(kw.keyword);
    let changeText: string;
    if (delta === null || delta === undefined) {
      changeText = "\u2014";
    } else if (delta > 0) {
      changeText = `\u25B2 ${delta}`;
    } else if (delta < 0) {
      changeText = `\u25BC ${Math.abs(delta)}`;
    } else {
      changeText = "\u2014";
    }

    return {
      keyword: kw.keyword ?? "",
      position: String(kw.position ?? 0),
      change: changeText,
      volume: String(kw.searchVolume ?? 0),
      url: kw.url ?? "",
      cpc: `$${(kw.cpc ?? 0).toFixed(2)}`,
    };
  });

  const top10 = keywords.filter((k) => (k.position ?? 999) <= 10).length;
  const top3 = keywords.filter((k) => (k.position ?? 999) <= 3).length;

  blocks.push(
    {
      type: "context",
      text: `Showing top ${rows.length} of ${keywords.length} keywords by search volume. Last updated: ${cached.rankedKeywords?.fetchedAt ?? "unknown"}`,
    },
    {
      type: "stats",
      stats: [
        { label: "Tracked Keywords", value: String(keywords.length) },
        { label: "Top 10", value: String(top10) },
        { label: "Top 3", value: String(top3) },
      ],
    },
    { type: "divider" },
    {
      type: "table",
      blockId: "rankings-table",
      columns: [
        { key: "keyword", label: "Keyword", format: "text" },
        { key: "position", label: "Position", format: "text" },
        { key: "change", label: "Change", format: "text" },
        { key: "volume", label: "Search Volume", format: "text" },
        { key: "url", label: "URL", format: "text" },
        { key: "cpc", label: "CPC", format: "text" },
      ],
      rows,
    },
  );

  // Trend chart — top 10 keywords by search volume
  const topForChart = sorted.slice(0, 10);
  const seriesData: Array<{ name: string; data: Array<[number, number]> }> = [];

  for (const kw of topForChart) {
    const history = await loadRankingHistory(ctx, kw.keyword);
    if (history.length >= 2) {
      seriesData.push({
        name: kw.keyword,
        data: history.map((h) => [new Date(h.fetchedAt).getTime(), h.position]),
      });
    }
  }

  if (seriesData.length > 0) {
    blocks.push(
      { type: "divider" },
      { type: "header", text: "Ranking Trends (Top Keywords)" },
      {
        type: "chart",
        config: {
          chart_type: "timeseries",
          series: seriesData,
          x_axis_name: "Date",
          y_axis_name: "Position (lower is better)",
          style: "line",
          gradient: true,
          height: 300,
        },
      },
    );
  } else {
    blocks.push(
      { type: "divider" },
      {
        type: "context",
        text: "Ranking trends will appear after the next weekly refresh (requires at least 2 data points).",
      },
    );
  }

  return blocks;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-rankings.ts
git commit -m "feat(seo): rankings tab with delta column, stats, trend chart"
```

---

### Task 7: Backlinks Tab — Three Sub-Tabs

**Files:**
- Modify: `packages/plugin-seo-toolkit/src/admin-backlinks.ts`

- [ ] **Step 1: Rewrite backlinks tab with sub-tab dispatch and shared header**

Replace the entire contents of `admin-backlinks.ts`:

```typescript
import type { PluginContext } from "emdash";
import { loadCachedDomainData } from "./dataforseo.js";
import type { BacklinksSubTab } from "./admin-tab-bar.js";
import { buildSubTabBar } from "./admin-tab-bar.js";

function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

async function getKnownPaths(ctx: PluginContext): Promise<Set<string>> {
  const knownPaths = new Set<string>();
  try {
    for (const collection of ["posts", "pages"]) {
      const result: any = await ctx.content!.list(collection, {
        where: { status: "published" },
        limit: 1000,
      });
      const items = result?.items ?? [];
      for (const entry of items) {
        const slug = (entry as any).slug ?? (entry as any).id;
        knownPaths.add(`/${slug}`);
        knownPaths.add(`/${collection}/${slug}`);
      }
    }
  } catch {
    // Content API may not be available
  }
  return knownPaths;
}

function buildSharedHeader(summary: any, prevSummary: any): any[] {
  const totalTrend = prevSummary
    ? `${(summary.totalBacklinks ?? 0) >= (prevSummary.totalBacklinks ?? 0) ? "+" : ""}${(summary.totalBacklinks ?? 0) - (prevSummary.totalBacklinks ?? 0)}`
    : undefined;
  const domainsTrend = prevSummary
    ? `${(summary.referringDomains ?? 0) >= (prevSummary.referringDomains ?? 0) ? "+" : ""}${(summary.referringDomains ?? 0) - (prevSummary.referringDomains ?? 0)}`
    : undefined;

  return [
    {
      type: "stats",
      stats: [
        {
          label: "Total Backlinks",
          value: String(summary.totalBacklinks ?? 0),
          ...(totalTrend ? { trend: totalTrend, trend_direction: (summary.totalBacklinks ?? 0) >= (prevSummary?.totalBacklinks ?? 0) ? "up" : "down" } : {}),
        },
        {
          label: "Referring Domains",
          value: String(summary.referringDomains ?? 0),
          ...(domainsTrend ? { trend: domainsTrend, trend_direction: (summary.referringDomains ?? 0) >= (prevSummary?.referringDomains ?? 0) ? "up" : "down" } : {}),
        },
        { label: "Domain Rank", value: String(summary.rank ?? 0) },
        { label: "Dofollow", value: String(summary.dofollow ?? 0) },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Fetch Backlinks",
          action_id: "refresh_data:backlinks",
          style: "primary",
        },
      ],
    },
  ];
}

function buildDomainsSubTab(cached: any): any[] {
  const domains = Array.isArray(cached.referringDomains?.data)
    ? cached.referringDomains!.data
    : [];

  if (domains.length === 0) {
    return [{ type: "banner", title: "No referring domains", description: "Fetch backlinks to see referring domains.", variant: "default" }];
  }

  const domainRows = domains.slice(0, 50).map((d: any) => ({
    domain: d.domain ?? "",
    backlinks: String(d.backlinks ?? 0),
    rank: String(d.rank ?? 0),
  }));

  return [
    { type: "divider" },
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
}

function buildLinksSubTab(cached: any, knownPaths: Set<string>): any[] {
  const backlinks = Array.isArray(cached.individualBacklinks?.data)
    ? cached.individualBacklinks!.data
    : [];

  if (backlinks.length === 0) {
    return [{ type: "banner", title: "No individual backlinks", description: "Fetch backlinks to see individual inbound links.", variant: "default" }];
  }

  const rows = backlinks.slice(0, 100).map((b: any) => {
    const targetPath = extractPath(b.urlTo ?? "");
    const exists = knownPaths.has(targetPath);
    const hasRedirect = !!b.redirectUrl;

    let status: string;
    if (exists) {
      status = "Live";
    } else if (hasRedirect) {
      status = "Redirected";
    } else {
      status = "404";
    }

    return {
      source: b.domainFrom ?? b.urlFrom ?? "",
      target: targetPath,
      anchor: b.anchor ?? "",
      type: b.dofollow ? "dofollow" : "nofollow",
      status,
    };
  });

  return [
    { type: "divider" },
    {
      type: "context",
      text: `Showing ${rows.length} of ${backlinks.length} inbound links`,
    },
    {
      type: "table",
      blockId: "individual-backlinks",
      columns: [
        { key: "source", label: "Source", format: "text" },
        { key: "target", label: "Target Page", format: "text" },
        { key: "anchor", label: "Anchor", format: "text" },
        { key: "type", label: "Type", format: "badge" },
        { key: "status", label: "Status", format: "badge" },
      ],
      rows,
    },
  ];
}

function buildBrokenSubTab(cached: any, knownPaths: Set<string>): any[] {
  const broken = Array.isArray(cached.brokenBacklinks?.data)
    ? cached.brokenBacklinks!.data
    : [];

  if (broken.length === 0) {
    return [
      { type: "divider" },
      {
        type: "context",
        text: "No broken inbound links detected. All external links point to live pages.",
      },
    ];
  }

  const brokenRows = broken.slice(0, 50).map((b: any) => {
    const targetPath = extractPath(b.targetUrl ?? "");
    const exists = knownPaths.has(targetPath);
    const hasRedirect = !!b.redirectTarget;

    let status: string;
    if (exists) {
      status = "Live";
    } else if (hasRedirect) {
      status = "Redirected";
    } else {
      status = "404";
    }

    return {
      targetPath,
      status,
      redirect: hasRedirect ? extractPath(b.redirectTarget) : "None",
      source: b.sourceDomain ?? "",
      anchor: b.anchor ?? "",
    };
  });

  return [
    { type: "divider" },
    {
      type: "context",
      text: `${broken.length} broken inbound links found. Set up redirects to preserve link equity.`,
    },
    {
      type: "table",
      blockId: "broken-backlinks",
      columns: [
        { key: "targetPath", label: "Target URL on Your Site", format: "text" },
        { key: "status", label: "Status", format: "badge" },
        { key: "redirect", label: "Redirect To", format: "text" },
        { key: "source", label: "Linking Domain", format: "text" },
        { key: "anchor", label: "Anchor Text", format: "text" },
      ],
      rows: brokenRows,
    },
  ];
}

export async function buildBacklinksTab(
  ctx: PluginContext,
  subTab: BacklinksSubTab = "domains",
): Promise<any[]> {
  // Check credentials
  const login = await ctx.kv.get<string>("settings:dataforseoLogin");
  if (!login) {
    return [
      { type: "header", text: "Backlinks" },
      {
        type: "banner",
        title: "DataForSEO not configured",
        description: "Go to the Settings tab to add your DataForSEO credentials.",
        variant: "default",
      },
    ];
  }

  let cached: any;
  try {
    cached = await loadCachedDomainData(ctx);
  } catch {
    cached = {};
  }

  const summary = cached.backlinkSummary?.data;
  const prevSummary = await ctx.kv.get<any>("prev_backlink_summary");

  const blocks: any[] = [
    { type: "header", text: "Backlinks" },
  ];

  if (!summary) {
    blocks.push(
      buildSubTabBar(subTab),
      {
        type: "banner",
        title: "No backlink data",
        description: "Click Fetch Backlinks to pull your backlink profile from DataForSEO.",
        variant: "default",
      },
    );
    return blocks;
  }

  blocks.push(...buildSharedHeader(summary, prevSummary));
  blocks.push(buildSubTabBar(subTab));

  const knownPaths = (subTab === "links" || subTab === "broken")
    ? await getKnownPaths(ctx)
    : new Set<string>();

  switch (subTab) {
    case "domains":
      blocks.push(...buildDomainsSubTab(cached));
      break;
    case "links":
      blocks.push(...buildLinksSubTab(cached, knownPaths));
      break;
    case "broken":
      blocks.push(...buildBrokenSubTab(cached, knownPaths));
      break;
  }

  return blocks;
}
```

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/admin-backlinks.ts
git commit -m "feat(seo): backlinks tab with 3 sub-tabs, individual links, stats trends"
```

---

### Task 8: Route Handler — Tab State Machine

**Files:**
- Modify: `packages/plugin-seo-toolkit/src/sandbox-entry.ts`

- [ ] **Step 1: Rewrite the route handler with tab/sub-tab dispatch**

Replace the entire contents of `sandbox-entry.ts`:

```typescript
import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { runAudit } from "./audit.js";
import { refreshDomainData } from "./dataforseo.js";
import { analyzeContent } from "./analysis.js";
import { buildDashboardTab } from "./admin-dashboard.js";
import { buildRankingsTab } from "./admin-rankings.js";
import { buildBacklinksTab } from "./admin-backlinks.js";
import { buildSettingsTab, saveSettings } from "./admin-settings.js";
import { buildTabBar } from "./admin-tab-bar.js";
import type { Tab, BacklinksSubTab } from "./admin-tab-bar.js";

async function getDomain(ctx: PluginContext): Promise<string> {
  return (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
}

async function renderTab(ctx: PluginContext, tab: Tab, subTab?: BacklinksSubTab): Promise<any> {
  let tabBlocks: any[];
  switch (tab) {
    case "dashboard":
      tabBlocks = await buildDashboardTab(ctx);
      break;
    case "rankings":
      tabBlocks = await buildRankingsTab(ctx);
      break;
    case "backlinks":
      tabBlocks = await buildBacklinksTab(ctx, subTab ?? "domains");
      break;
    case "settings":
      tabBlocks = await buildSettingsTab(ctx);
      break;
    default:
      tabBlocks = await buildDashboardTab(ctx);
  }
  return { blocks: [buildTabBar(tab), ...tabBlocks] };
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
        const autoRefresh =
          (await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
        if (!autoRefresh) return;

        const domain = await getDomain(ctx);
        ctx.log.info("SEO weekly refresh starting", { domain });

        const { calls, errors } = await refreshDomainData(ctx, domain);
        if (errors.length > 0) {
          ctx.log.warn("DataForSEO refresh had errors", { errors });
        }
        ctx.log.info(`DataForSEO refresh complete: ${calls} API calls`);

        const results = await runAudit(ctx);
        ctx.log.info(
          `Content audit complete: ${results.length} entries scanned`,
        );

        // Save audit summary for trend comparison
        if (results.length > 0) {
          const totalScore = results.reduce((sum, r) => sum + r.score, 0);
          const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
          await ctx.kv.set("prev_audit_summary", {
            avgScore: Math.round(totalScore / results.length),
            totalIssues,
            count: results.length,
          });
        }

        await ctx.kv.set("settings:lastRefresh", new Date().toISOString());
      },
    },
  },

  routes: {
    admin: {
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const interaction = routeCtx.input;

        // Page load — default to dashboard
        if (interaction.type === "page_load") {
          return renderTab(ctx, "dashboard");
        }

        // Settings form submit
        if (interaction.type === "form_submit") {
          if (interaction.action_id === "save_seo_settings") {
            await saveSettings(ctx, interaction.values ?? {});
            return {
              ...(await renderTab(ctx, "settings")),
              toast: { message: "Settings saved", type: "success" as const },
            };
          }
        }

        // Block actions — tabs, sub-tabs, and action buttons
        if (interaction.type === "block_action") {
          const actionId: string = interaction.action_id ?? "";

          // Tab navigation
          if (actionId.startsWith("tab:")) {
            const tab = actionId.slice(4) as Tab;
            return renderTab(ctx, tab);
          }

          // Backlinks sub-tab navigation
          if (actionId.startsWith("subtab:")) {
            const subTab = actionId.slice(7) as BacklinksSubTab;
            return renderTab(ctx, "backlinks", subTab);
          }

          // Fetch data (from rankings or backlinks tab)
          if (actionId.startsWith("refresh_data")) {
            const returnTab = actionId === "refresh_data:backlinks" ? "backlinks" : "rankings";
            const domain = await getDomain(ctx);
            try {
              const { calls, errors } = await refreshDomainData(ctx, domain);
              await ctx.kv.set("settings:lastRefresh", new Date().toISOString());
              return {
                ...(await renderTab(ctx, returnTab as Tab)),
                toast: {
                  message:
                    errors.length > 0
                      ? `Refreshed with ${errors.length} error(s): ${errors[0]}`
                      : `Data refreshed (${calls} API calls)`,
                  type: errors.length > 0 ? ("warning" as const) : ("success" as const),
                },
              };
            } catch (err) {
              return {
                ...(await renderTab(ctx, returnTab as Tab)),
                toast: {
                  message: `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
                  type: "error" as const,
                },
              };
            }
          }

          // Run content audit (from dashboard tab)
          if (actionId === "run_audit") {
            try {
              const results = await runAudit(ctx);
              // Save audit summary for trend comparison
              if (results.length > 0) {
                const totalScore = results.reduce((sum, r) => sum + r.score, 0);
                const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
                await ctx.kv.set("prev_audit_summary", {
                  avgScore: Math.round(totalScore / results.length),
                  totalIssues,
                  count: results.length,
                });
              }
              return {
                ...(await renderTab(ctx, "dashboard")),
                toast: {
                  message: `Audit complete: ${results.length} entries scanned`,
                  type: "success" as const,
                },
              };
            } catch (err) {
              return {
                ...(await renderTab(ctx, "dashboard")),
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

Key changes:
- `renderTab()` helper composes `[tabBar, ...tabContent]` for every response
- Tab dispatch via `tab:*` action_id prefix
- Sub-tab dispatch via `subtab:*` action_id prefix
- `refresh_data:rankings` and `refresh_data:backlinks` return to their respective tabs
- `run_audit` saves `prev_audit_summary` to KV for dashboard trend data
- Cron hook also saves `prev_audit_summary` after weekly audit

- [ ] **Step 2: Commit**

```bash
git add packages/plugin-seo-toolkit/src/sandbox-entry.ts
git commit -m "feat(seo): route handler with tab/sub-tab state machine"
```

---

### Task 9: Typecheck + Dev Server Validation

**Files:** None (validation only)

- [ ] **Step 1: Run typecheck**

```bash
cd /Users/chrisguill/Documents/GitHub/Client_ClinicalEffects/practical-travel-gear
npm run typecheck
```

Expected: No type errors in the plugin files. Fix any issues.

- [ ] **Step 2: Start dev server and verify admin loads**

```bash
npx emdash dev
```

Navigate to `http://localhost:4321/_emdash/admin`. Verify:
- Single "SEO" entry in sidebar under Plugins
- Dashboard tab loads by default with audit button
- Tab navigation between Dashboard / Rankings / Backlinks / Settings works
- Settings form saves and shows success toast
- Backlinks sub-tabs switch between Referring Domains / Individual Links / Broken Links

- [ ] **Step 3: Test action buttons**

If DataForSEO credentials are configured:
- Click "Fetch Rankings" on Rankings tab — verify data refreshes and tab re-renders with toast
- Click "Fetch Backlinks" on Backlinks tab — verify same
- Click "Run Content Audit" on Dashboard tab — verify audit runs and stats update

If not configured:
- Verify banner prompts appear on Dashboard, Rankings, and Backlinks tabs

- [ ] **Step 4: Commit any fixes**

```bash
git add -u packages/plugin-seo-toolkit/src/
git commit -m "fix(seo): resolve typecheck and runtime issues"
```

---

### Task 10: Final Commit + Issue Closure

- [ ] **Step 1: Verify all changes are committed**

```bash
git status
git log --oneline -10
```

- [ ] **Step 2: Close issues**

```bash
gh issue close 2 --comment "Implemented: 4 admin pages consolidated into single SEO page with tab navigation."
gh issue close 3 --comment "Implemented: Fetch buttons moved to Rankings/Backlinks tabs, Run Audit moved to Dashboard. Settings is credentials-only."
gh issue close 4 --comment "Implemented: ranking_history table stores 12 weeks of snapshots. Rankings tab shows week-over-week delta column and timeseries trend chart for top 10 keywords."
gh issue close 7 --comment "Implemented: Backlinks tab has 3 sub-tabs — Referring Domains, Individual Links (new, with target page cross-reference), and Broken Links."
```
