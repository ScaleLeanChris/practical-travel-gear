import type { PluginContext } from "emdash";
import { loadCachedDomainData } from "./dataforseo.js";

export async function buildBacklinksPage(ctx: PluginContext) {
	let cached;
	try {
		cached = await loadCachedDomainData(ctx);
	} catch {
		cached = {};
	}

	const summary = cached.backlinkSummary?.data;
	if (!summary) {
		return {
			blocks: [
				{ type: "header", text: "Backlinks" },
				{
					type: "context",
					text: "No backlink data yet. Configure DataForSEO credentials in SEO Settings and click Fetch Rankings & Backlinks.",
				},
			],
		};
	}

	const domains = Array.isArray(cached.referringDomains?.data)
		? cached.referringDomains!.data
		: [];
	const broken = Array.isArray(cached.brokenBacklinks?.data)
		? cached.brokenBacklinks!.data
		: [];

	const domainRows = domains.slice(0, 50).map((d: any) => ({
		domain: d.domain ?? "",
		backlinks: String(d.backlinks ?? 0),
		rank: String(d.rank ?? 0),
	}));

	const brokenRows = broken.slice(0, 50).map((b: any) => ({
		deadUrl: b.targetUrl ?? "",
		source: b.sourceDomain ?? "",
		anchor: b.anchor ?? "",
	}));

	const blocks: any[] = [
		{ type: "header", text: "Backlinks" },
		{
			type: "context",
			text: `Last updated: ${cached.backlinkSummary?.fetchedAt ?? "unknown"}`,
		},
		{
			type: "fields",
			fields: [
				{ label: "Total Backlinks", value: String(summary.totalBacklinks ?? 0) },
				{ label: "Referring Domains", value: String(summary.referringDomains ?? 0) },
				{ label: "Domain Rank", value: String(summary.rank ?? 0) },
				{ label: "Dofollow", value: String(summary.dofollow ?? 0) },
			],
		},
	];

	if (domainRows.length > 0) {
		blocks.push(
			{ type: "divider" },
			{ type: "header", text: "Top Referring Domains" },
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
		);
	}

	if (brokenRows.length > 0) {
		blocks.push(
			{ type: "divider" },
			{
				type: "header",
				text: `Broken Inbound Links (${broken.length} found)`,
			},
			{
				type: "context",
				text: "External sites linking to pages that no longer exist on your site. Set up redirects for these.",
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
