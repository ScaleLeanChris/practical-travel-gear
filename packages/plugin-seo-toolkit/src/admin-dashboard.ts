import type { PluginContext } from "emdash";
import type { AuditResult } from "./audit.js";

export async function buildDashboardTab(ctx: PluginContext): Promise<any[]> {
  // Check credentials
  const login = await ctx.kv.get<string>("settings:dataforseoLogin");
  const hasCredentials = !!login;

  let results: AuditResult[] = [];
  try {
    const auditData: any = await ctx.storage.audit_results.query({
      limit: 1000,
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
    items: [
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

  const domain = (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
  const top50 = results.slice(0, 50);

  // Fetch content metadata (status, dates) via list() — fields are top-level on entries
  const entryMeta = new Map<string, { status: string; date: string }>();
  if (ctx.content) {
    const collections = [...new Set(top50.map((r) => r.collection))];
    for (const collection of collections) {
      try {
        let cursor: string | undefined;
        do {
          const result: any = await ctx.content.list(collection, { limit: 200, cursor });
          for (const entry of result?.items ?? []) {
            const status = entry.status ?? "";
            const date = entry.publishedAt ?? entry.createdAt ?? "";
            const shortDate = date ? new Date(date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
            entryMeta.set(entry.id, { status, date: shortDate });
          }
          cursor = result?.cursor;
        } while (cursor);
      } catch {
        // Content may not be accessible
      }
    }
  }


  if (top50.length > 0) {
    const entryRows = top50.map((r) => {
      const meta = entryMeta.get(r.entryId);
      const url = `https://${domain}/${r.slug.replace(/^\/+/, "")}`;
      return {
        title: r.title,
        url,
        score: String(r.score),
        issues: String(r.issues.length),
        status: meta?.status ?? "",
        date: meta?.date ?? "",
      };
    });

    blocks.push(
      { type: "divider" },
      { type: "header", text: "Content Scores (worst first)" },
      {
        type: "table",
        blockId: "entry-scores",
        columns: [
          { key: "title", label: "Title", format: "text" },
          { key: "score", label: "Score", format: "text" },
          { key: "issues", label: "Issues", format: "text" },
          { key: "status", label: "Status", format: "text" },
          { key: "date", label: "Date", format: "text" },
        ],
        rows: entryRows,
      },
    );
  }

  return blocks;
}
