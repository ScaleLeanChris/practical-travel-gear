import type { PluginContext } from "emdash";
import { loadCachedDomainData } from "./dataforseo.js";

export async function buildRankingsPage(ctx: PluginContext) {
	const cached = await loadCachedDomainData(ctx);

	if (!cached.rankedKeywords?.data?.length) {
		return {
			blocks: [
				{ type: "header", text: "Rankings" },
				{
					type: "context",
					text: "No ranking data yet. Configure DataForSEO credentials in **SEO Settings** and click **Refresh Data Now**.",
				},
			],
		};
	}

	const keywords = cached.rankedKeywords.data
		.sort((a, b) => b.searchVolume - a.searchVolume)
		.slice(0, 100);

	const rows = keywords.map((kw) => ({
		keyword: kw.keyword,
		position: String(kw.position),
		volume: String(kw.searchVolume),
		url: kw.url,
		cpc: `$${kw.cpc.toFixed(2)}`,
	}));

	return {
		blocks: [
			{ type: "header", text: "Rankings" },
			{
				type: "context",
				text: `Showing top ${rows.length} keywords by search volume. Last updated: ${cached.rankedKeywords.fetchedAt ?? "unknown"}`,
			},
			{
				type: "stats",
				stats: [
					{ label: "Tracked Keywords", value: String(cached.rankedKeywords.data.length) },
					{ label: "Top 10 Keywords", value: String(cached.rankedKeywords.data.filter((k) => k.position <= 10).length) },
					{ label: "Top 3 Keywords", value: String(cached.rankedKeywords.data.filter((k) => k.position <= 3).length) },
				],
			},
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
		],
	};
}
