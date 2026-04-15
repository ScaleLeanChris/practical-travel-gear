/**
 * Paperclip plugin for EmDash CMS integration.
 *
 * Gives Paperclip agents tools to interact with the EmDash CMS:
 * - List and query content (posts, pages)
 * - Read SEO analysis scores and audit results
 * - Access keyword rankings and backlink data
 * - Receive real-time content events from the CMS
 *
 * Requires the `plugin-paperclip` EmDash plugin on the CMS side.
 *
 * Configuration:
 *   EMDASH_SITE_URL    - Base URL of the EmDash site (e.g., https://practicaltravelgear.com)
 *   EMDASH_API_SECRET  - Shared secret matching the EmDash plugin's inbound secret
 *   AUTO_CREATE_ISSUES - "true" to auto-create Paperclip issues on content events
 */

import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { EmDashClient } from "./emdash-client.js";
import { tools } from "./tools.js";

export const manifest = {
	id: "emdash-cms",
	name: "EmDash CMS",
	version: "1.0.0",
	description:
		"Connect Paperclip agents to EmDash CMS for content management and SEO monitoring",
	capabilities: ["http"],
	configSchema: {
		EMDASH_SITE_URL: {
			type: "string",
			label: "EmDash Site URL",
			required: true,
			placeholder: "https://practicaltravelgear.com",
		},
		EMDASH_API_SECRET: {
			type: "secret",
			label: "API Secret",
			required: true,
			description: "Shared secret configured in the EmDash Paperclip plugin settings",
		},
		AUTO_CREATE_ISSUES: {
			type: "boolean",
			label: "Auto-create issues on content events",
			default: false,
		},
	},
	jobs: [
		{
			id: "emdash-health-check",
			schedule: "0 */6 * * *",
			description: "Check EmDash site health and SEO status every 6 hours",
		},
	],
};

const plugin = definePlugin({
	async setup(ctx) {
		const siteUrl = ctx.config.get("EMDASH_SITE_URL");
		const apiSecret = ctx.config.get("EMDASH_API_SECRET");

		if (!siteUrl || !apiSecret) {
			ctx.logger.warn(
				"EmDash CMS plugin not configured — set EMDASH_SITE_URL and EMDASH_API_SECRET",
			);
			return;
		}

		const client = new EmDashClient(
			{ siteUrl, apiSecret },
			ctx.http.fetch,
		);

		// Register tools for agents
		for (const tool of tools) {
			ctx.tools.register({
				name: tool.name,
				description: tool.description,
				parameters: tool.parameters,
				execute: async (params: Record<string, unknown>) => {
					return tool.handler(client, params);
				},
			});
		}

		// Subscribe to content events from EmDash (via webhooks)
		ctx.events.on("webhook.emdash-cms", async (event) => {
			const payload = event.data;
			const eventType = payload?.type as string;

			ctx.logger.info(`EmDash event: ${eventType}`, {
				collection: payload?.collection,
				entryId: payload?.entryId,
				title: payload?.title,
				seoScore: payload?.seoScore,
			});

			// Emit typed events onto the Paperclip bus
			if (eventType) {
				await ctx.events.emit(`emdash.${eventType}`, {
					source: "emdash-cms",
					...payload,
				});
			}

			// Record activity
			await ctx.activity.log({
				type: "emdash.content_event",
				message: `${eventType}: ${payload?.title ?? payload?.entryId ?? "unknown"}`,
				metadata: {
					collection: payload?.collection,
					entryId: payload?.entryId,
					seoScore: payload?.seoScore,
				},
			});

			// Optionally create an issue for content review
			const autoCreate = ctx.config.get("AUTO_CREATE_ISSUES");
			if (autoCreate === "true" && eventType === "content.published") {
				await ctx.issues.create({
					title: `Review published content: ${payload?.title}`,
					description: [
						`**Collection:** ${payload?.collection}`,
						`**Slug:** ${payload?.slug}`,
						`**SEO Score:** ${payload?.seoScore ?? "N/A"}`,
						"",
						"A new piece of content was published on the EmDash site. Review for quality and SEO compliance.",
					].join("\n"),
					labels: ["content-review", "auto-created"],
				});
			}
		});

		// Register the scheduled health check job
		ctx.jobs.register("emdash-health-check", async () => {
			ctx.logger.info("Running EmDash health check");

			const result = await client.getSeoSummary();
			if (!result.ok) {
				ctx.logger.warn("EmDash health check failed", {
					error: result.error,
				});
				return;
			}

			const health = result.data as any;
			const message = [
				`EmDash SEO Health:`,
				`Audit ${health.averageAuditScore}/100`,
				`Content ${health.averageAnalysisScore}/100`,
				`${health.totalEntries} entries, ${health.totalIssues} issues`,
			].join(" | ");

			await ctx.activity.log({
				type: "emdash.health_check",
				message,
				metadata: health,
			});

			// Emit a metric for dashboard tracking
			await ctx.metrics.gauge("emdash.audit_score", health.averageAuditScore);
			await ctx.metrics.gauge("emdash.content_score", health.averageAnalysisScore);
			await ctx.metrics.gauge("emdash.total_issues", health.totalIssues);
		});

		ctx.logger.info("EmDash CMS plugin initialized", { siteUrl });
	},

	async onWebhook(event, ctx) {
		// Webhook handler for direct EmDash -> Paperclip events
		const payload = event.body;
		const eventType = payload?.type as string;

		if (!eventType) {
			ctx.logger.warn("Received webhook without event type");
			return { status: 400, body: { error: "Missing event type" } };
		}

		ctx.logger.info(`Webhook received: ${eventType}`, {
			collection: payload?.collection,
			title: payload?.title,
		});

		// Emit to the Paperclip event bus
		await ctx.events.emit(`emdash.${eventType}`, {
			source: "emdash-cms-webhook",
			receivedAt: new Date().toISOString(),
			...payload,
		});

		// Activity log
		await ctx.activity.log({
			type: "emdash.webhook",
			message: `Webhook: ${eventType} — ${payload?.title ?? payload?.entryId ?? "unknown"}`,
			metadata: payload,
		});

		return { status: 200, body: { ok: true } };
	},

	async onHealth(ctx) {
		const siteUrl = ctx.config.get("EMDASH_SITE_URL");
		const apiSecret = ctx.config.get("EMDASH_API_SECRET");

		if (!siteUrl || !apiSecret) {
			return { status: "degraded", message: "Not configured" };
		}

		try {
			const client = new EmDashClient(
				{ siteUrl, apiSecret },
				ctx.http.fetch,
			);
			const result = await client.getSeoSummary();
			if (result.ok) {
				return { status: "healthy", message: `Connected to ${siteUrl}` };
			}
			return {
				status: "degraded",
				message: `API error: ${result.error}`,
			};
		} catch (err) {
			return {
				status: "unhealthy",
				message: err instanceof Error ? err.message : String(err),
			};
		}
	},

	async onConfigChanged(ctx) {
		ctx.logger.info("EmDash CMS plugin config changed — reinitializing");
	},

	async onShutdown(ctx) {
		ctx.logger.info("EmDash CMS plugin shutting down");
	},
});

export default plugin;

// Allow standalone execution
runWorker(plugin);
