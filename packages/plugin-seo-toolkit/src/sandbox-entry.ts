import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { runAudit } from "./audit.js";
import { refreshDomainData } from "./dataforseo.js";
import { analyzeContent } from "./analysis.js";
import { buildDashboardPage } from "./admin-dashboard.js";
import { buildRankingsPage } from "./admin-rankings.js";
import { buildBacklinksPage } from "./admin-backlinks.js";
import { buildSettingsPage, saveSettings } from "./admin-settings.js";

async function getDomain(ctx: PluginContext): Promise<string> {
	return (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
}

export default definePlugin({
	hooks: {
		"content:afterSave": {
			priority: 200,
			timeout: 15000,
			errorPolicy: "continue",
			handler: async (event: any, ctx: PluginContext) => {
				try {
					await analyzeContent(ctx, event.content, event.collection);
				} catch (err) {
					ctx.log.warn("SEO analysis failed", err);
				}
			},
		},

		cron: {
			handler: async (_event: any, ctx: PluginContext) => {
				const autoRefresh =
					(await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
				if (!autoRefresh) return;

				const domain = await getDomain(ctx);
				ctx.log.info("SEO weekly refresh starting", { domain });

				const { calls, errors } = await refreshDomainData(ctx, domain);
				if (errors.length > 0) {
					ctx.log.warn("DataForSEO refresh had errors", { errors });
				}
				ctx.log.info(`DataForSEO refresh complete: ${calls} API calls`);

				const results = await runAudit(ctx);
				ctx.log.info(
					`Content audit complete: ${results.length} entries scanned`,
				);

				await ctx.kv.set("settings:lastRefresh", new Date().toISOString());
			},
		},
	},

	routes: {
		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = routeCtx.input;

				if (interaction.type === "page_load") {
					switch (interaction.page) {
						case "/dashboard":
							return buildDashboardPage(ctx);
						case "/rankings":
							return buildRankingsPage(ctx);
						case "/backlinks":
							return buildBacklinksPage(ctx);
						case "/settings":
							return buildSettingsPage(ctx);
						default:
							return buildDashboardPage(ctx);
					}
				}

				if (interaction.type === "form_submit") {
					if (interaction.action_id === "save_seo_settings") {
						return saveSettings(ctx, interaction.values ?? {});
					}
				}

				if (interaction.type === "block_action") {
					if (interaction.action_id === "refresh_data") {
						const domain = await getDomain(ctx);
						try {
							const { calls, errors } = await refreshDomainData(
								ctx,
								domain,
							);
							await ctx.kv.set(
								"settings:lastRefresh",
								new Date().toISOString(),
							);
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message:
										errors.length > 0
											? `Refreshed with ${errors.length} error(s): ${errors[0]}`
											: `Data refreshed (${calls} API calls)`,
									type:
										errors.length > 0
											? ("warning" as const)
											: ("success" as const),
								},
							};
						} catch (err) {
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
									type: "error" as const,
								},
							};
						}
					}

					if (interaction.action_id === "run_audit") {
						try {
							const results = await runAudit(ctx);
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: `Audit complete: ${results.length} entries scanned`,
									type: "success" as const,
								},
							};
						} catch (err) {
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: `Audit failed: ${err instanceof Error ? err.message : String(err)}`,
									type: "error" as const,
								},
							};
						}
					}
				}

				return { blocks: [] };
			},
		},
	},
});
