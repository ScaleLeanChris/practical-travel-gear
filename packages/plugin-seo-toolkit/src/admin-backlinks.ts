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
