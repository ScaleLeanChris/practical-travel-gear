# SEO Plugin Consolidation & Enhancement

Addresses issues #2, #3, #4, #7. Consolidates the SEO toolkit plugin's 4 separate admin pages into a single tabbed interface, relocates action buttons to their respective views, adds historical ranking tracking with trend visualization, and restructures the backlinks page with sub-tabs including a new individual links view.

## Scope

All changes are within `packages/plugin-seo-toolkit/src/`. No site-side (Astro) changes required.

**Files modified:**
- `index.ts` — descriptor: replace 4 adminPages with 1, add `ranking_history` storage table
- `sandbox-entry.ts` — route handler: tab/sub-tab navigation state machine, split action button handlers
- `admin-dashboard.ts` — unchanged content, but called as a tab builder instead of page builder
- `admin-rankings.ts` — add "Change" column, trend chart, "Fetch Rankings" button
- `admin-backlinks.ts` — restructure into 3 sub-tab builders, add individual links fetcher/renderer
- `admin-settings.ts` — remove action buttons, settings-only
- `dataforseo.ts` — add `fetchIndividualBacklinks()`, add ranking history write/read/prune logic

**New files:** None. All changes fit within existing modules.

## 1. Navigation & Page Structure (Issue #2)

### Descriptor change

Replace 4 `adminPages` entries with one:

```typescript
adminPages: [
  { path: "/seo", label: "SEO", icon: "bar-chart" },
]
```

### Tab navigation

The `admin` route handler manages tab state via `block_action` interactions:

- `page_load` -> render Dashboard tab (default)
- `block_action` with `action_id: "tab:dashboard"` -> render Dashboard
- `block_action` with `action_id: "tab:rankings"` -> render Rankings
- `block_action` with `action_id: "tab:backlinks"` -> render Backlinks (default sub-tab: Referring Domains)
- `block_action` with `action_id: "tab:settings"` -> render Settings

Every response starts with a tab bar `actions` block:

```typescript
{
  type: "actions",
  elements: [
    { type: "button", label: "Dashboard", action_id: "tab:dashboard", style: activeTab === "dashboard" ? "primary" : "default" },
    { type: "button", label: "Rankings", action_id: "tab:rankings", style: activeTab === "rankings" ? "primary" : "default" },
    { type: "button", label: "Backlinks", action_id: "tab:backlinks", style: activeTab === "backlinks" ? "primary" : "default" },
    { type: "button", label: "Settings", action_id: "tab:settings", style: activeTab === "settings" ? "primary" : "default" },
  ],
}
```

### Tab builder pattern

Each tab has a builder function returning `Block[]`. The route handler composes: `[tabBar, ...tabContent]`.

```
buildTabBar(activeTab) -> actions block
buildDashboardTab(ctx) -> Block[]
buildRankingsTab(ctx) -> Block[]
buildBacklinksTab(ctx, subTab) -> Block[]
buildSettingsTab(ctx) -> Block[]
```

## 2. Action Button Relocation (Issue #3)

### Current placement

Both "Fetch Rankings & Backlinks" and "Run Content Audit" are on the Settings page.

### New placement

| Button | Tab | Action ID |
|--------|-----|-----------|
| Run Content Audit | Dashboard | `run_audit` |
| Fetch Rankings | Rankings | `refresh_data:rankings` |
| Fetch Backlinks | Backlinks (all sub-tabs) | `refresh_data:backlinks` |

Both fetch buttons call `refreshDomainData()` (fetches everything in one pass). This keeps data in sync and matches the weekly cron behavior. The buttons are labeled contextually for the tab they appear on. Distinct action IDs let the route handler re-render the correct tab after the refresh completes.

### Settings page

Settings tab retains only:
- DataForSEO login (text_input)
- DataForSEO password (secret_input)
- Domain (text_input)
- Auto-refresh toggle

No action buttons on Settings.

## 3. Ranking History & Trends (Issue #4)

### New storage table

Add `ranking_history` to the descriptor:

```typescript
storage: {
  // ... existing tables ...
  ranking_history: {
    indexes: ["keyword", "fetchedAt"],
  },
}
```

### Record shape

```typescript
interface RankingSnapshot {
  keyword: string;
  position: number;
  searchVolume: number;
  url: string;
  competition: number;
  cpc: number;
  fetchedAt: string; // ISO date string (date only, e.g. "2026-04-14")
}
```

Key format: `${keyword}:${fetchedAt}` (e.g. `"best travel backpack:2026-04-14"`)

### Write path

In `refreshDomainData()`, after fetching ranked keywords and writing to `domain_data`, also write each keyword to `ranking_history`:

```
for each keyword in rankedKeywords:
  key = `${keyword.keyword}:${today}`
  ranking_history.put(key, { ...keyword, fetchedAt: today })
```

### Retention

After writing new snapshots, prune records older than 84 days (12 weeks):

```
cutoff = today - 84 days
ranking_history.query({ where: { fetchedAt: { lt: cutoffDate } } })
  -> delete each result
```

### Week-over-week delta

When building the Rankings tab:

1. Load latest keywords from `domain_data` (existing)
2. Calculate `lastWeek = today - 7 days`
3. For each keyword, query `ranking_history` for key `${keyword}:${lastWeekDate}`
4. Delta = `previousPosition - currentPosition` (positive = improved)
5. Display: green `↑N` for positive, red `↓N` for negative, muted `—` for zero or no data

### Trend chart

Block Kit `chart` block below the rankings table:

```typescript
{
  type: "chart",
  config: {
    chart_type: "timeseries",
    series: topKeywords.map(kw => ({
      name: kw.keyword,
      data: kw.history.map(h => [new Date(h.fetchedAt).getTime(), h.position]),
    })),
    x_axis_name: "Date",
    y_axis_name: "Position (lower is better)",
    style: "line",
    gradient: true,
    height: 300,
  },
}
```

- Limited to top 10 keywords by search volume
- For each keyword, query `ranking_history` ordered by `fetchedAt` ascending
- Only rendered when history data exists (at least 2 data points)

## 4. Backlinks Tabs (Issue #7)

### Sub-tab navigation

The Backlinks tab renders a second `actions` block for sub-tabs:

```typescript
{
  type: "actions",
  elements: [
    { type: "button", label: "Referring Domains", action_id: "subtab:domains", style: ... },
    { type: "button", label: "Individual Links", action_id: "subtab:links", style: ... },
    { type: "button", label: "Broken Links", action_id: "subtab:broken", style: ... },
  ],
}
```

Action IDs `subtab:domains`, `subtab:links`, `subtab:broken` are handled in the route handler, which re-renders the Backlinks tab with the selected sub-tab.

Default sub-tab on entering Backlinks: Referring Domains.

### Shared header

All 3 sub-tabs share a common header rendered above the sub-tab content:

- `stats` block: Total Backlinks, Referring Domains, Domain Rank, Dofollow count (from `backlink_summary` in `domain_data`)
- "Fetch Backlinks" action button

### Sub-tab: Referring Domains (existing)

Table: domain, backlink count, rank. Top 50 rows. No logic changes — same as current `admin-backlinks.ts` referring domains section.

### Sub-tab: Individual Links (new)

**New DataForSEO call: `fetchIndividualBacklinks()`**

Calls `backlinks/backlinks/live`:

```typescript
{
  target: domain,
  limit: 1000,
  order_by: ["rank.desc"],
  // No mode filter — get all individual backlinks
}
```

Returns per link: `url_from`, `url_to`, `anchor`, `dofollow` (boolean), `is_broken`, `redirect_url`.

Cached in `domain_data` under key `"individual_backlinks"` with `fetchedAt` timestamp. Fetched as part of `refreshDomainData()`.

**Table columns:**

| Column | Source | Format |
|--------|--------|--------|
| Source URL | `url_from` | text (truncated) |
| Target Page | extracted path from `url_to` | text |
| Anchor | `anchor` | text |
| Type | `dofollow` boolean | badge: green "dofollow" / red "nofollow" |
| Status | cross-reference check | badge: green "Live" / yellow "Redirected" / red "404" |

**Cross-reference logic** (same pattern as existing broken links code):

```
for each backlink:
  path = extractPath(url_to)
  slug = path without leading slash
  check posts collection for slug
  check pages collection for slug
  if found -> "Live"
  else if redirect exists -> "Redirected"
  else -> "404"
```

Top 100 rows displayed.

### Sub-tab: Broken Links (existing)

Same as current broken links section in `admin-backlinks.ts`. Table: target path, status badge (Live/Redirected/404), redirect target, linking domain, anchor text. No logic changes.

## Route Handler State Machine

The `admin` route handler in `sandbox-entry.ts` dispatches based on interaction type and action_id:

```
page_load -> Dashboard tab
form_submit:save_seo_settings -> save settings, render Settings tab + toast
block_action:tab:* -> render requested tab
block_action:subtab:* -> render Backlinks tab with requested sub-tab
block_action:refresh_data -> call refreshDomainData(), render current tab + toast
block_action:run_audit -> call runAudit(), render Dashboard tab + toast
```

The handler determines the "current tab" from the action_id prefix:
- `tab:*` actions set the active tab directly
- `subtab:*` actions imply the Backlinks tab is active
- `refresh_data` re-renders whichever tab the button appeared on (Rankings or Backlinks) — determined by checking which tab builder included the button. Track this by passing tab context through the action_id or by using distinct action_ids (`refresh_data:rankings` vs `refresh_data:backlinks`).

Revised action IDs for fetch buttons:
- Rankings tab: `refresh_data:rankings`
- Backlinks tab: `refresh_data:backlinks`

Both call `refreshDomainData()`, then render their respective tab with a success toast.

## Edge Cases

- **No DataForSEO credentials configured:** Dashboard, Rankings, and Backlinks tabs show a `banner` block (variant: "default") prompting the user to configure credentials in the Settings tab. Action buttons are hidden.
- **No ranking history yet:** "Change" column shows `—` for all keywords. Trend chart is not rendered (replaced with a `context` block: "Ranking trends will appear after the next weekly refresh").
- **Individual backlinks API returns empty:** Sub-tab shows a `context` block: "No individual backlinks found."
- **Content cross-reference misses:** If a target URL path doesn't match any post or page slug, it's marked as "404". This is the conservative default — manual review of these entries may reveal URL patterns not covered by the slug check.
