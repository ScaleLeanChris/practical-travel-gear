import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { buildActivityPage } from "./admin-activity.js";
import { buildTasksPage } from "./admin-dashboard.js";
import { buildSettingsPage, saveSettings } from "./admin-settings.js";
import {
	getConfig,
	getDestination,
	postTaskToHyperagent,
	type HyperagentDestination,
	type HyperagentTaskInput,
	type HyperagentTaskResult,
} from "./hyperagent-client.js";

type TaskPriority = "low" | "normal" | "high" | "urgent";

const MAX_LOG_ENTRIES = 500;

async function logTask(
	ctx: PluginContext,
	task: HyperagentTaskInput,
	result: { ok: boolean; status?: number; error?: string },
	destination?: HyperagentDestination,
) {
	try {
		const timestamp = new Date().toISOString();
		const id = `${task.source}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		await ctx.storage.task_log.put(id, {
			title: task.title,
			source: task.source,
			taskType: task.taskType,
			destinationId: destination?.id ?? task.destinationId ?? null,
			destinationLabel: destination?.label ?? null,
			priority: task.priority ?? "normal",
			status: result.ok ? "sent" : "failed",
			httpStatus: result.status ?? null,
			error: result.error ?? null,
			contentUrl: task.contentUrl ?? null,
			timestamp,
		});

		// Trim old entries beyond cap
		const { items } = await ctx.storage.task_log.query({
			orderBy: { timestamp: "desc" },
			limit: MAX_LOG_ENTRIES + 50,
		});
		if (items.length > MAX_LOG_ENTRIES) {
			const toDelete = items.slice(MAX_LOG_ENTRIES);
			for (const item of toDelete) {
				await ctx.storage.task_log.delete(item.id);
			}
		}
	} catch {
		// Logging should never block the editor save path.
	}
}

async function sendTask(
	ctx: PluginContext,
	task: HyperagentTaskInput,
): Promise<HyperagentTaskResult> {
	const config = await getConfig(ctx);
	if (!config) {
		const result: HyperagentTaskResult = {
			ok: false,
			error: "Hyperagent webhook is not configured",
		};
		await logTask(ctx, task, result);
		return result;
	}

	if (
		task.destinationId &&
		!config.destinations.some(
			(destination) => destination.id === task.destinationId,
		)
	) {
		const result: HyperagentTaskResult = {
			ok: false,
			error: `Destination "${task.destinationId}" does not have a webhook configured`,
		};
		await logTask(ctx, task, result);
		return result;
	}

	const destination = getDestination(config, task.destinationId);
	const result = await postTaskToHyperagent(ctx, config, destination, task);
	await logTask(ctx, task, result, destination);
	return result;
}

function normalizePriority(value: unknown): TaskPriority {
	if (
		value === "low" ||
		value === "normal" ||
		value === "high" ||
		value === "urgent"
	) {
		return value;
	}
	return "normal";
}

function labelsFromValue(value: unknown): string[] {
	if (typeof value !== "string") return [];
	return value
		.split(",")
		.map((label) => label.trim())
		.filter(Boolean);
}

function textValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}

async function manualTaskFromValues(
	values: Record<string, unknown>,
): Promise<HyperagentTaskInput | null> {
	const title = textValue(values.title);
	const instructions = textValue(values.instructions);
	if (!title || !instructions) return null;

	return {
		source: "manual",
		taskType: textValue(values.customTaskType) || textValue(values.taskType) || "general",
		destinationId: textValue(values.destinationId),
		title,
		instructions,
		priority: normalizePriority(values.priority),
		contentUrl: textValue(values.contentUrl),
		labels: labelsFromValue(values.labels),
		context: {
			createdFrom: "emdash-admin",
		},
	};
}

function entryTitle(entry: any): string {
	return entry?.data?.title ?? entry?.data?.name ?? entry?.id ?? "Untitled";
}

function contentUrl(siteUrl: string, slug: string): string {
	const cleanSlug = slug.replace(/^\/+/, "");
	return `${siteUrl}/${cleanSlug}`;
}

async function taskFromContentSave(
	ctx: PluginContext,
	event: any,
): Promise<HyperagentTaskInput | null> {
	const autoContentTasksEnabled =
		(await ctx.kv.get<boolean>("settings:autoContentTasksEnabled")) ?? false;
	if (!autoContentTasksEnabled) return null;

	const collectionsFilter =
		(await ctx.kv.get<string>("settings:autoContentCollections")) ?? "";
	if (collectionsFilter) {
		const allowed = collectionsFilter.split(",").map((c) => c.trim()).filter(Boolean);
		if (allowed.length > 0 && !allowed.includes(event.collection)) return null;
	}

	const config = await getConfig(ctx);
	if (!config) return null;

	const entry = event.content;
	if (!entry?.id) return null;

	const includeContentSummary =
		(await ctx.kv.get<boolean>("settings:includeContentSummary")) ?? true;
	const destinationId =
		(await ctx.kv.get<string>("settings:autoContentDestinationId")) ??
		config.defaultDestinationId;
	const taskType =
		(await ctx.kv.get<string>("settings:autoContentTaskType")) ??
		"writing.revision";
	const instructions =
		(await ctx.kv.get<string>("settings:autoTaskInstructions")) ??
		"Review this content update and create any follow-up optimization, editorial, or QA work needed.";
	const title = entryTitle(entry);
	const slug = entry.slug ?? entry.id;
	const url = contentUrl(config.siteUrl, slug);

	const context: Record<string, unknown> = {
		collection: event.collection,
		entryId: entry.id,
		slug,
		status: entry?.data?.status ?? null,
		title,
		url,
	};

	if (includeContentSummary) {
		context.summary = {
			description:
				entry?.data?.description ??
				entry?.data?.excerpt ??
				entry?.data?.seo_description ??
				null,
			publishedAt: entry?.data?.published_at ?? null,
			updatedAt: entry?.data?.updated_at ?? null,
		};
	}

	return {
		source: "content",
		taskType,
		destinationId,
		title: `Review content update: ${title}`,
		instructions,
		priority: "normal",
		contentUrl: url,
		labels: ["emdash", event.collection].filter(Boolean),
		context,
	};
}

async function sendManualTask(ctx: PluginContext, values: Record<string, unknown>) {
	const task = await manualTaskFromValues(values);
	if (!task) {
		return {
			...(await buildTasksPage(ctx)),
			toast: {
				message: "Task title and instructions are required",
				type: "error" as const,
			},
		};
	}

	const result = await sendTask(ctx, task);
	return {
		...(await buildTasksPage(ctx)),
		toast: {
			message: result.ok
				? "Task sent to Hyperagent"
				: `Task failed: ${result.error ?? "Unknown error"}`,
			type: result.ok ? ("success" as const) : ("error" as const),
		},
	};
}

async function sendTestTask(ctx: PluginContext) {
	const result = await sendTask(ctx, {
		source: "manual",
		taskType: "general",
		title: "Connection test from EmDash",
		instructions:
			"Confirm Hyperagent received this test task from the Practical Travel Gear CMS.",
		priority: "low",
		labels: ["emdash", "test"],
		context: {
			createdFrom: "hyperagent-plugin-test",
		},
	});

	return {
		...(await buildTasksPage(ctx)),
		toast: {
			message: result.ok
				? "Test task sent to Hyperagent"
				: `Test task failed: ${result.error ?? "Unknown error"}`,
			type: result.ok ? ("success" as const) : ("error" as const),
		},
	};
}

export default definePlugin({
	hooks: {
		"content:afterSave": {
			priority: 350,
			timeout: 10000,
			errorPolicy: "continue",
			handler: async (event: any, ctx: PluginContext) => {
				const task = await taskFromContentSave(ctx, event);
				if (!task) return;

				const result = await sendTask(ctx, task);
				if (!result.ok) {
					ctx.log.warn("Hyperagent task webhook failed", {
						status: result.status,
						error: result.error,
					});
				}
			},
		},
	},

	routes: {
		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = routeCtx.input;

				if (interaction.type === "page_load") {
					switch (interaction.page) {
						case "/tasks":
							return buildTasksPage(ctx);
						case "/activity":
							return buildActivityPage(ctx);
						case "/settings":
							return buildSettingsPage(ctx);
						default:
							return buildTasksPage(ctx);
					}
				}

				if (interaction.type === "form_submit") {
					if (interaction.action_id === "save_hyperagent_settings") {
						return saveSettings(ctx, interaction.values ?? {});
					}
					if (interaction.action_id === "send_hyperagent_task") {
						return sendManualTask(ctx, interaction.values ?? {});
					}
				}

				if (interaction.type === "block_action") {
					if (interaction.action_id === "send_test_task") {
						return sendTestTask(ctx);
					}
				}

				return { blocks: [] };
			},
		},
	},
});
