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

  // Entry scores with inline SEO Agent actions
  const hasHyperagent = !!(await ctx.kv.get<string>("settings:hyperagentWebhookUrl"));
  const top50 = results.slice(0, 50);

  if (top50.length > 0) {
    blocks.push(
      { type: "divider" },
      { type: "header", text: "Content Scores (worst first)" },
    );

    for (const r of top50) {
      const accessory = hasHyperagent && r.score < 70
        ? { type: "button", label: "Send to SEO Agent", action_id: `hyperagent:${r.collection}:${r.entryId}`, style: "primary" }
        : undefined;

      blocks.push({
        type: "section",
        text: `**${r.title}** — ${r.collection} — Score: ${r.score} — ${r.issues.length} issue${r.issues.length === 1 ? "" : "s"}`,
        ...(accessory ? { accessory } : {}),
      });
    }
  }

  return blocks;
}
