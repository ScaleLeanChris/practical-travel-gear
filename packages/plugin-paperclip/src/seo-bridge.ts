import type { PluginContext } from "emdash";

/**
 * Reads SEO analysis scores from the seo-toolkit plugin's shared storage.
 * The SEO toolkit stores data in its own plugin storage namespace,
 * accessible via ctx.storage when declared as a dependency.
 *
 * Since EmDash plugins share the same D1 database, we read the SEO toolkit's
 * storage tables directly through the plugin context.
 */

export interface SeoScoreSummary {
	entryId: string;
	collection: string;
	score: number;
	readabilityGrade: number;
	lastAnalysis: string;
	checks: Record<string, { pass: boolean; value?: number | string; detail?: string }>;
}

export interface AuditSummary {
	entryId: string;
	collection: string;
	slug: string;
	title: string;
	score: number;
	issues: Array<{
		check: string;
		severity: "error" | "warning" | "info";
		detail: string;
	}>;
	lastAudit: string;
}

export interface SiteHealthSummary {
	totalEntries: number;
	averageAuditScore: number;
	averageAnalysisScore: number;
	totalIssues: number;
	issueBreakdown: Record<string, number>;
	worstEntries: Array<{ entryId: string; title: string; score: number }>;
	lastRefresh: string | null;
}

/**
 * Get the SEO analysis score for a specific entry.
 * Returns null if no analysis has been run yet.
 */
export async function getSeoScore(
	ctx: PluginContext,
	entryId: string,
): Promise<SeoScoreSummary | null> {
	try {
		const result = await ctx.storage.analysis_scores.get(entryId);
		return result as SeoScoreSummary | null;
	} catch {
		return null;
	}
}

/**
 * Get SEO analysis scores for all entries in a collection.
 */
export async function getSeoScores(
	ctx: PluginContext,
	collection?: string,
): Promise<SeoScoreSummary[]> {
	try {
		const query: any = { limit: 500 };
		if (collection) {
			query.where = { collection };
		}
		const { items } = await ctx.storage.analysis_scores.query(query);
		return items as SeoScoreSummary[];
	} catch {
		return [];
	}
}

/**
 * Get audit results for a specific entry.
 */
export async function getAuditResult(
	ctx: PluginContext,
	entryId: string,
): Promise<AuditSummary | null> {
	try {
		const result = await ctx.storage.audit_results.get(entryId);
		return result as AuditSummary | null;
	} catch {
		return null;
	}
}

/**
 * Get all audit results, optionally filtered by collection.
 */
export async function getAuditResults(
	ctx: PluginContext,
	collection?: string,
): Promise<AuditSummary[]> {
	try {
		const query: any = { limit: 500 };
		if (collection) {
			query.where = { collection };
		}
		const { items } = await ctx.storage.audit_results.query(query);
		return items as AuditSummary[];
	} catch {
		return [];
	}
}

/**
 * Build an aggregate site health summary from SEO data.
 */
export async function getSiteHealth(
	ctx: PluginContext,
): Promise<SiteHealthSummary> {
	const auditResults = await getAuditResults(ctx);
	const analysisScores = await getSeoScores(ctx);

	const totalEntries = auditResults.length;
	const averageAuditScore =
		totalEntries > 0
			? Math.round(
					auditResults.reduce((sum, r) => sum + r.score, 0) / totalEntries,
				)
			: 0;
	const averageAnalysisScore =
		analysisScores.length > 0
			? Math.round(
					analysisScores.reduce((sum, r) => sum + r.score, 0) /
						analysisScores.length,
				)
			: 0;

	const issueBreakdown: Record<string, number> = {};
	let totalIssues = 0;
	for (const result of auditResults) {
		for (const issue of result.issues) {
			issueBreakdown[issue.check] = (issueBreakdown[issue.check] ?? 0) + 1;
			totalIssues++;
		}
	}

	const worstEntries = auditResults
		.sort((a, b) => a.score - b.score)
		.slice(0, 10)
		.map((r) => ({ entryId: r.entryId, title: r.title, score: r.score }));

	const lastRefresh = await ctx.kv.get<string>("settings:lastRefresh");

	return {
		totalEntries,
		averageAuditScore,
		averageAnalysisScore,
		totalIssues,
		issueBreakdown,
		worstEntries,
		lastRefresh: lastRefresh ?? null,
	};
}

/**
 * Get cached ranked keywords from the SEO toolkit's domain_data store.
 */
export async function getKeywords(
	ctx: PluginContext,
): Promise<any[] | null> {
	try {
		const cached: any = await ctx.storage.domain_data.get("ranked_keywords");
		return cached?.data ?? null;
	} catch {
		return null;
	}
}

/**
 * Get cached backlink data from the SEO toolkit's domain_data store.
 */
export async function getBacklinks(
	ctx: PluginContext,
): Promise<{ summary: any | null; referringDomains: any[] | null; broken: any[] | null }> {
	try {
		const [summary, domains, broken] = await Promise.all([
			ctx.storage.domain_data.get("backlink_summary"),
			ctx.storage.domain_data.get("referring_domains"),
			ctx.storage.domain_data.get("broken_backlinks"),
		]);
		return {
			summary: (summary as any)?.data ?? null,
			referringDomains: (domains as any)?.data ?? null,
			broken: (broken as any)?.data ?? null,
		};
	} catch {
		return { summary: null, referringDomains: null, broken: null };
	}
}
