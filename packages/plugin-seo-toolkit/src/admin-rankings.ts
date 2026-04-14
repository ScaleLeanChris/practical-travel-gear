import type { PluginContext } from "emdash";
import { loadCachedDomainData } from "./dataforseo.js";

export async function buildRankingsPage(ctx: PluginContext) {
	let cached;
	try {
		cached = await loadCachedDomainData(ctx);
	} catch {
		cached = {};
	}

	const keywords = Array.isArray(cached.rankedKeywords?.data)
		? cached.rankedKeywords!.data
		: [];

	if (keywords.length === 0) {
		return {
			blocks: [
				{ type: "header", text: "Rankings" },
				{
					type: "context",
					text: "No ranking data yet. Configure DataForSEO credentials in SEO Settings and click Fetch Rankings & Backlinks.",
				},
			],
		};
	}

	const sorted = [...keywords]
		.sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
		.slice(0, 100);

	const rows = sorted.map((kw) => ({
		keyword: kw.keyword ?? "",
		position: String(kw.position ?? 0),
		volume: String(kw.searchVolume ?? 0),
		url: kw.url ?? "",
		cpc: `$${(kw.cpc ?? 0).toFixed(2)}`,
	}));

	const top10 = keywords.filter((k) => (k.position ?? 999) <= 10).length;
	const top3 = keywords.filter((k) => (k.position ?? 999) <= 3).length;

	const blocks: any[] = [
		{ type: "header", text: "Rankings" },
		{
			type: "context",
			text: `Showing top ${rows.length} of ${keywords.length} keywords by search volume. Last updated: ${cached.rankedKeywords?.fetchedAt ?? "unknown"}`,
		},
		{
			type: "fields",
			fields: [
				{ label: "Tracked Keywords", value: String(keywords.length) },
				{ label: "Top 10", value: String(top10) },
				{ label: "Top 3", value: String(top3) },
			],
		},
	];

	if (rows.length > 0) {
		blocks.push(
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
		);
	}

	return { blocks };
}
