import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { getConfig, postWebhook, postActivity } from "./paperclip-client.js";
import { getSeoScore, getSiteHealth } from "./seo-bridge.js";
import { buildDashboardPage } from "./admin-dashboard.js";
import { buildActivityPage } from "./admin-activity.js";
import { buildSettingsPage, saveSettings } from "./admin-settings.js";
import { handleInboundApi } from "./inbound-api.js";

async function logEvent(
	ctx: PluginContext,
	event: {
		eventType: string;
		direction?: string;
		collection?: string;
		entryId?: string;
		title?: string;
		sent: boolean;
		error?: string;
	},
) {
	try {
		const logId = `${event.direction ?? "outbound"}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		await ctx.storage.event_log.put(logId, {
			...event,
			timestamp: new Date().toISOString(),
		});
	} catch {
		// Non-critical
	}
}

export default definePlugin({
	hooks: {
		/**
		 * Forward content save events to Paperclip.
		 * Runs at priority 300, AFTER the SEO toolkit's content:afterSave (priority 200),
		 * so fresh SEO scores are available.
		 */
		"content:afterSave": {
			priority: 300,
			timeout: 10000,
			errorPolicy: "continue",
			handler: async (event: any, ctx: PluginContext) => {
				const eventsEnabled =
					(await ctx.kv.get<boolean>("settings:eventsEnabled")) ?? true;
				if (!eventsEnabled) return;

				const config = await getConfig(ctx);
				if (!config) return;

				const entry = event.content;
				const collection = event.collection;
				const title = entry?.data?.title ?? entry?.id ?? "unknown";
				const slug = entry?.slug ?? entry?.id;
				const status = entry?.data?.status;

				// Read SEO score (written by seo-toolkit at priority 200)
				let seoScore: number | null = null;
				try {
					const score = await getSeoScore(ctx, entry.id);
					seoScore = score?.score ?? null;
				} catch {
					// SEO plugin may not be installed
				}

				const eventType =
					status === "published"
						? "content.published"
						: status === "draft"
							? "content.drafted"
							: "content.updated";

				const result = await postWebhook(ctx, config, {
					type: eventType,
					collection,
					entryId: entry.id,
					slug,
					title,
					seoScore,
					data: {
						status,
						publishedAt: entry?.data?.published_at ?? null,
					},
				});

				await logEvent(ctx, {
					eventType,
					collection,
					entryId: entry.id,
					title,
					sent: result.ok,
					error: result.error,
				});

				if (!result.ok) {
					ctx.log.warn("Paperclip webhook failed", {
						status: result.status,
						error: result.error,
					});
				}
			},
		},

		/**
		 * Weekly SEO digest — sends site health summary to Paperclip.
		 */
		cron: {
			handler: async (_event: any, ctx: PluginContext) => {
				const digestEnabled =
					(await ctx.kv.get<boolean>("settings:seoDigestEnabled")) ?? true;
				if (!digestEnabled) return;

				const config = await getConfig(ctx);
				if (!config) return;

				try {
					const health = await getSiteHealth(ctx);
					const message = [
						`Site SEO Digest:`,
						`Audit Score: ${health.averageAuditScore}/100`,
						`Content Score: ${health.averageAnalysisScore}/100`,
						`${health.totalEntries} entries, ${health.totalIssues} issues`,
					].join(" | ");

					await postActivity(ctx, config, message, {
						type: "seo_digest",
						...health,
					});

					// Also send as webhook for structured processing
					await postWebhook(ctx, config, {
						type: "seo.digest",
						data: health as unknown as Record<string, unknown>,
					});

					await logEvent(ctx, {
						eventType: "seo.digest",
						sent: true,
					});

					ctx.log.info("SEO digest sent to Paperclip");
				} catch (err) {
					ctx.log.warn("SEO digest failed", err);
					await logEvent(ctx, {
						eventType: "seo.digest",
						sent: false,
						error: err instanceof Error ? err.message : String(err),
					});
				}
			},
		},
	},

	routes: {
		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = routeCtx.input;

				// Page loads
				if (interaction.type === "page_load") {
					switch (interaction.page) {
						case "/dashboard":
							return buildDashboardPage(ctx);
						case "/activity":
							return buildActivityPage(ctx);
						case "/settings":
							return buildSettingsPage(ctx);
						default:
							return buildDashboardPage(ctx);
					}
				}

				// Form submissions
				if (interaction.type === "form_submit") {
					if (interaction.action_id === "save_paperclip_settings") {
						return saveSettings(ctx, interaction.values ?? {});
					}
				}

				// Button actions
				if (interaction.type === "block_action") {
					if (interaction.action_id === "test_connection") {
						const config = await getConfig(ctx);
						if (!config) {
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message:
										"Configure API URL and API Key first",
									type: "error" as const,
								},
							};
						}

						try {
							const response = await ctx.http!.fetch(
								`${config.apiBase}/api/health`,
								{
									headers: {
										Authorization: `Bearer ${config.apiKey}`,
									},
								},
							);

							if (response.ok) {
								return {
									...(await buildSettingsPage(ctx)),
									toast: {
										message: "Connection successful",
										type: "success" as const,
									},
								};
							}
							const body = await response.text();
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: `Connection failed: ${response.status} ${body}`,
									type: "error" as const,
								},
							};
						} catch (err) {
							return {
								...(await buildSettingsPage(ctx)),
								toast: {
									message: `Connection failed: ${err instanceof Error ? err.message : String(err)}`,
									type: "error" as const,
								},
							};
						}
					}
				}

				return { blocks: [] };
			},
		},

		/**
		 * Inbound API route for Paperclip agents.
		 * Agents call this to query content, SEO data, and trigger actions.
		 */
		api: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				return handleInboundApi(routeCtx, ctx);
			},
		},
	},
});
