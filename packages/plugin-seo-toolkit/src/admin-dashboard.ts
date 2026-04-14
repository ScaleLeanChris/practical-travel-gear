import type { PluginContext } from "emdash";
import type { AuditResult } from "./audit.js";

function trafficLight(score: number): string {
	if (score >= 90) return "🟢";
	if (score >= 70) return "🟡";
	return "🔴";
}

export async function buildDashboardPage(ctx: PluginContext) {
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

	if (results.length === 0) {
		return {
			blocks: [
				{ type: "header", text: "SEO Dashboard" },
				{
					type: "context",
					text: "No audit data yet. Go to SEO Settings and click Run Content Audit to scan your content.",
				},
			],
		};
	}

	const totalScore = results.reduce((sum, r) => sum + r.score, 0);
	const avgScore = Math.round(totalScore / results.length);
	const totalIssues = results.reduce(
		(sum, r) => sum + r.issues.length,
		0,
	);

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

	const entryRows = results.slice(0, 50).map((r) => ({
		title: r.title,
		collection: r.collection,
		score: `${trafficLight(r.score)} ${r.score}`,
		issues: String(r.issues.length),
	}));

	const blocks: any[] = [
		{ type: "header", text: "SEO Dashboard" },
		{
			type: "fields",
			fields: [
				{ label: "Site Health", value: `${trafficLight(avgScore)} ${avgScore}/100` },
				{ label: "Entries Scanned", value: String(results.length) },
				{ label: "Issues Found", value: String(totalIssues) },
			],
		},
	];

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

	return { blocks };
}
