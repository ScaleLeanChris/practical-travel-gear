import type { PluginContext } from "emdash";
import { loadCachedDomainData } from "./dataforseo.js";
import type { BacklinksSubTab } from "./admin-tab-bar.js";
import { buildSubTabBar } from "./admin-tab-bar.js";

function extractPath(url: string): string {
  try {
    return new URL(url).pathname;
  } catch {
    return url;
  }
}

async function getKnownPaths(ctx: PluginContext): Promise<Set<string>> {
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
  return knownPaths;
}

function buildSharedHeader(summary: any, prevSummary: any): any[] {
  const totalTrend = prevSummary
    ? `${(summary.totalBacklinks ?? 0) >= (prevSummary.totalBacklinks ?? 0) ? "+" : ""}${(summary.totalBacklinks ?? 0) - (prevSummary.totalBacklinks ?? 0)}`
    : undefined;
  const domainsTrend = prevSummary
    ? `${(summary.referringDomains ?? 0) >= (prevSummary.referringDomains ?? 0) ? "+" : ""}${(summary.referringDomains ?? 0) - (prevSummary.referringDomains ?? 0)}`
    : undefined;

  return [
    {
      type: "stats",
      stats: [
        {
          label: "Total Backlinks",
          value: String(summary.totalBacklinks ?? 0),
          ...(totalTrend ? { trend: totalTrend, trend_direction: (summary.totalBacklinks ?? 0) >= (prevSummary?.totalBacklinks ?? 0) ? "up" : "down" } : {}),
        },
        {
          label: "Referring Domains",
          value: String(summary.referringDomains ?? 0),
          ...(domainsTrend ? { trend: domainsTrend, trend_direction: (summary.referringDomains ?? 0) >= (prevSummary?.referringDomains ?? 0) ? "up" : "down" } : {}),
        },
        { label: "Domain Rank", value: String(summary.rank ?? 0) },
        { label: "Dofollow", value: String(summary.dofollow ?? 0) },
      ],
    },
    {
      type: "actions",
      elements: [
        {
          type: "button",
          label: "Fetch Backlinks",
          action_id: "refresh_data:backlinks",
          style: "primary",
        },
      ],
    },
  ];
}

function buildDomainsSubTab(cached: any): any[] {
  const domains = Array.isArray(cached.referringDomains?.data)
    ? cached.referringDomains!.data
    : [];

  if (domains.length === 0) {
    return [{ type: "banner", title: "No referring domains", description: "Fetch backlinks to see referring domains.", variant: "default" }];
  }

  const domainRows = domains.slice(0, 50).map((d: any) => ({
    domain: d.domain ?? "",
    backlinks: String(d.backlinks ?? 0),
    rank: String(d.rank ?? 0),
  }));

  return [
    { type: "divider" },
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
}

function buildLinksSubTab(cached: any, knownPaths: Set<string>): any[] {
  const backlinks = Array.isArray(cached.individualBacklinks?.data)
    ? cached.individualBacklinks!.data
    : [];

  if (backlinks.length === 0) {
    return [{ type: "banner", title: "No individual backlinks", description: "Fetch backlinks to see individual inbound links.", variant: "default" }];
  }

  const rows = backlinks.slice(0, 100).map((b: any) => {
    const targetPath = extractPath(b.urlTo ?? "");
    const exists = knownPaths.has(targetPath);
    const hasRedirect = !!b.redirectUrl;

    let status: string;
    if (exists) {
      status = "Live";
    } else if (hasRedirect) {
      status = "Redirected";
    } else {
      status = "404";
    }

    return {
      source: b.urlFrom ?? b.domainFrom ?? "",
      target: targetPath,
      anchor: b.anchor ?? "",
      type: b.dofollow ? "dofollow" : "nofollow",
      status,
    };
  });

  return [
    { type: "divider" },
    {
      type: "context",
      text: `Showing ${rows.length} of ${backlinks.length} inbound links`,
    },
    {
      type: "table",
      blockId: "individual-backlinks",
      columns: [
        { key: "source", label: "Source", format: "text" },
        { key: "target", label: "Target Page", format: "text" },
        { key: "anchor", label: "Anchor", format: "text" },
        { key: "type", label: "Type", format: "badge" },
        { key: "status", label: "Status", format: "badge" },
      ],
      rows,
    },
  ];
}

function buildBrokenSubTab(cached: any, knownPaths: Set<string>): any[] {
  const broken = Array.isArray(cached.brokenBacklinks?.data)
    ? cached.brokenBacklinks!.data
    : [];

  if (broken.length === 0) {
    return [
      { type: "divider" },
      {
        type: "context",
        text: "No broken inbound links detected. All external links point to live pages.",
      },
    ];
  }

  const brokenRows = broken.slice(0, 50).map((b: any) => {
    const targetPath = extractPath(b.targetUrl ?? "");
    const exists = knownPaths.has(targetPath);
    const hasRedirect = !!b.redirectTarget;

    let status: string;
    if (exists) {
      status = "Live";
    } else if (hasRedirect) {
      status = "Redirected";
    } else {
      status = "404";
    }

    return {
      targetPath,
      status,
      redirect: hasRedirect ? extractPath(b.redirectTarget) : "None",
      source: b.sourceDomain ?? "",
      anchor: b.anchor ?? "",
    };
  });

  return [
    { type: "divider" },
    {
      type: "context",
      text: `${broken.length} broken inbound links found. Set up redirects to preserve link equity.`,
    },
    {
      type: "table",
      blockId: "broken-backlinks",
      columns: [
        { key: "targetPath", label: "Target URL on Your Site", format: "text" },
        { key: "status", label: "Status", format: "badge" },
        { key: "redirect", label: "Redirect To", format: "text" },
        { key: "source", label: "Linking Domain", format: "text" },
        { key: "anchor", label: "Anchor Text", format: "text" },
      ],
      rows: brokenRows,
    },
  ];
}

export async function buildBacklinksTab(
  ctx: PluginContext,
  subTab: BacklinksSubTab = "domains",
): Promise<any[]> {
  // Check credentials
  const login = await ctx.kv.get<string>("settings:dataforseoLogin");
  if (!login) {
    return [
      { type: "header", text: "Backlinks" },
      {
        type: "banner",
        title: "DataForSEO not configured",
        description: "Go to the Settings tab to add your DataForSEO credentials.",
        variant: "default",
      },
    ];
  }

  let cached: any;
  try {
    cached = await loadCachedDomainData(ctx);
  } catch {
    cached = {};
  }

  const summary = cached.backlinkSummary?.data;
  const prevSummary = await ctx.kv.get<any>("prev_backlink_summary");

  const blocks: any[] = [
    { type: "header", text: "Backlinks" },
  ];

  if (!summary) {
    blocks.push(
      buildSubTabBar(subTab),
      {
        type: "banner",
        title: "No backlink data",
        description: "Click Fetch Backlinks to pull your backlink profile from DataForSEO.",
        variant: "default",
      },
    );
    return blocks;
  }

  blocks.push(...buildSharedHeader(summary, prevSummary));
  blocks.push(buildSubTabBar(subTab));

  const knownPaths = (subTab === "links" || subTab === "broken")
    ? await getKnownPaths(ctx)
    : new Set<string>();

  switch (subTab) {
    case "domains":
      blocks.push(...buildDomainsSubTab(cached));
      break;
    case "links":
      blocks.push(...buildLinksSubTab(cached, knownPaths));
      break;
    case "broken":
      blocks.push(...buildBrokenSubTab(cached, knownPaths));
      break;
  }

  return blocks;
}
