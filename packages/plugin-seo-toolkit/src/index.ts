import type { PluginDescriptor } from "emdash";

export function seoToolkitPlugin(): PluginDescriptor {
	return {
		id: "seo-toolkit",
		version: "1.0.0",
		format: "standard",
		entrypoint: "plugin-seo-toolkit/sandbox",
		options: {},
		capabilities: ["read:content", "read:media", "network:fetch"],
		allowedHosts: ["api.dataforseo.com", "hyperagent.com", "*.hyperagent.com"],
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
			ranking_history: {
				indexes: ["keyword", "fetchedAt"],
			},
		},
		adminPages: [
			{ path: "/seo", label: "SEO", icon: "bar-chart" },
		],
	};
}
