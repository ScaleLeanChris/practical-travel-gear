import type { PluginDescriptor } from "emdash";

export function seoToolkitPlugin(): PluginDescriptor {
	return {
		id: "seo-toolkit",
		version: "1.0.0",
		format: "standard",
		entrypoint: "plugin-seo-toolkit/sandbox",
		options: {},
		capabilities: ["read:content", "read:media", "network:fetch"],
		allowedHosts: ["api.dataforseo.com"],
		storage: {
			audit_results: {
				indexes: ["entryId", "collection", "score", "lastAudit"],
			},
			domain_data: {
				indexes: ["dataType", "fetchedAt"],
			},
			analysis_scores: {
				indexes: ["entryId", "collection", "lastAnalysis"],
			},
		},
		adminPages: [
			{ path: "/dashboard", label: "SEO Dashboard", icon: "bar-chart" },
			{ path: "/rankings", label: "Rankings", icon: "trending-up" },
			{ path: "/backlinks", label: "Backlinks", icon: "link" },
			{ path: "/settings", label: "SEO Settings", icon: "settings" },
		],
	};
}
