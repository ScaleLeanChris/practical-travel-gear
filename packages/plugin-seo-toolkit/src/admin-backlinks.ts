import type { PluginContext } from "emdash";
import { loadCachedDomainData } from "./dataforseo.js";

function extractPath(url: string): string {
	try {
		return new URL(url).pathname;
	} catch {
		return url;
	}
}

export async function buildBacklinksPage(ctx: PluginContext) {
	let cached: any;
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

	// Get known slugs to check if backlink targets exist
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

	// For broken backlinks: show the target path, source, and status
	const brokenRows = broken.slice(0, 50).map((b: any) => {
		const targetPath = extractPath(b.targetUrl ?? "");
		const exists = knownPaths.has(targetPath);
		return {
			targetPath,
			status: exists ? "Page exists (URL changed?)" : "404 — needs redirect",
			source: b.sourceDomain ?? "",
			sourceUrl: b.sourceUrl ?? "",
			anchor: b.anchor ?? "",
		};
	});

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
				text: "External sites are linking to these URLs on your site, but the pages return 404. Set up redirects to preserve link equity.",
			},
			{
				type: "table",
				blockId: "broken-backlinks",
				columns: [
					{ key: "targetPath", label: "Your URL (404)", format: "text" },
					{ key: "status", label: "Status", format: "badge" },
					{ key: "source", label: "Linking Domain", format: "text" },
					{ key: "anchor", label: "Anchor Text", format: "text" },
				],
				rows: brokenRows,
			},
		);
	} else {
		blocks.push(
			{ type: "divider" },
			{
				type: "context",
				text: "No broken inbound links detected. All external links point to live pages.",
			},
		);
	}

	return { blocks };
}
