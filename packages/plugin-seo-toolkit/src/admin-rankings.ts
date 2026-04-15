import type { PluginContext } from "emdash";
import {
  loadCachedDomainData,
  loadPreviousWeekRanking,
  loadRankingHistory,
} from "./dataforseo.js";

export async function buildRankingsTab(ctx: PluginContext): Promise<any[]> {
  // Check credentials
  const login = await ctx.kv.get<string>("settings:dataforseoLogin");
  if (!login) {
    return [
      { type: "header", text: "Rankings" },
      {
        type: "banner",
        title: "DataForSEO not configured",
        description: "Go to the Settings tab to add your DataForSEO credentials.",
        variant: "default",
      },
    ];
  }

  let cached;
  try {
    cached = await loadCachedDomainData(ctx);
  } catch {
    cached = {};
  }

  const keywords = Array.isArray(cached.rankedKeywords?.data)
    ? cached.rankedKeywords!.data
    : [];

  const blocks: any[] = [
    { type: "header", text: "Rankings" },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          text: "Fetch Rankings",
          action_id: "refresh_data:rankings",
          style: "primary",
        },
      ],
    },
  ];

  if (keywords.length === 0) {
    blocks.push({
      type: "banner",
      title: "No ranking data",
      description: "Click Fetch Rankings to pull your keyword positions from DataForSEO.",
      variant: "default",
    });
    return blocks;
  }

  const sorted = [...keywords]
    .sort((a, b) => (b.searchVolume ?? 0) - (a.searchVolume ?? 0))
    .slice(0, 100);

  // Load previous week rankings for delta
  const deltas = new Map<string, number | null>();
  for (const kw of sorted) {
    const prev = await loadPreviousWeekRanking(ctx, kw.keyword);
    deltas.set(kw.keyword, prev ? prev.position - kw.position : null);
  }

  const rows = sorted.map((kw) => {
    const delta = deltas.get(kw.keyword);
    let changeText: string;
    if (delta === null || delta === undefined) {
      changeText = "\u2014";
    } else if (delta > 0) {
      changeText = `\u25B2 ${delta}`;
    } else if (delta < 0) {
      changeText = `\u25BC ${Math.abs(delta)}`;
    } else {
      changeText = "\u2014";
    }

    return {
      keyword: kw.keyword ?? "",
      position: String(kw.position ?? 0),
      change: changeText,
      volume: String(kw.searchVolume ?? 0),
      url: kw.url ?? "",
      cpc: `$${(kw.cpc ?? 0).toFixed(2)}`,
    };
  });

  const top10 = keywords.filter((k) => (k.position ?? 999) <= 10).length;
  const top3 = keywords.filter((k) => (k.position ?? 999) <= 3).length;

  blocks.push(
    {
      type: "context",
      text: `Showing top ${rows.length} of ${keywords.length} keywords by search volume. Last updated: ${cached.rankedKeywords?.fetchedAt ?? "unknown"}`,
    },
    {
      type: "stats",
      stats: [
        { label: "Tracked Keywords", value: String(keywords.length) },
        { label: "Top 10", value: String(top10) },
        { label: "Top 3", value: String(top3) },
      ],
    },
    { type: "divider" },
    {
      type: "table",
      blockId: "rankings-table",
      columns: [
        { key: "keyword", label: "Keyword", format: "text" },
        { key: "position", label: "Position", format: "text" },
        { key: "change", label: "Change", format: "text" },
        { key: "volume", label: "Search Volume", format: "text" },
        { key: "url", label: "URL", format: "text" },
        { key: "cpc", label: "CPC", format: "text" },
      ],
      rows,
    },
  );

  // Trend chart — top 10 keywords by search volume
  const topForChart = sorted.slice(0, 10);
  const seriesData: Array<{ name: string; data: Array<[number, number]> }> = [];

  for (const kw of topForChart) {
    const history = await loadRankingHistory(ctx, kw.keyword);
    if (history.length >= 2) {
      seriesData.push({
        name: kw.keyword,
        data: history.map((h) => [new Date(h.fetchedAt).getTime(), h.position]),
      });
    }
  }

  if (seriesData.length > 0) {
    blocks.push(
      { type: "divider" },
      { type: "header", text: "Ranking Trends (Top Keywords)" },
      {
        type: "chart",
        config: {
          chart_type: "timeseries",
          series: seriesData,
          x_axis_name: "Date",
          y_axis_name: "Position (lower is better)",
          style: "line",
          gradient: true,
          height: 300,
        },
      },
    );
  } else {
    blocks.push(
      { type: "divider" },
      {
        type: "context",
        text: "Ranking trends will appear after the next weekly refresh (requires at least 2 data points).",
      },
    );
  }

  return blocks;
}
