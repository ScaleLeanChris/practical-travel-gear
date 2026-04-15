import type { PluginContext } from "emdash";
import {
	DEFAULT_DESTINATIONS_JSON,
	destinationOptions,
	isHyperagentWebhookUrl,
	parseDestinations,
} from "./hyperagent-client.js";

export async function buildSettingsPage(ctx: PluginContext) {
	const destinationsJson =
		(await ctx.kv.get<string>("settings:destinationsJson")) ??
		DEFAULT_DESTINATIONS_JSON;
	const destinations = parseDestinations(destinationsJson);
	const options = destinationOptions(destinations);
	const defaultDestinationId =
		(await ctx.kv.get<string>("settings:defaultDestinationId")) ??
		options[0]?.value ??
		"seo";
	const workspaceId = (await ctx.kv.get<string>("settings:workspaceId")) ?? "";
	const agentId = (await ctx.kv.get<string>("settings:agentId")) ?? "";
	const sourceName =
		(await ctx.kv.get<string>("settings:sourceName")) ?? "practical-travel-gear";
	const siteUrl =
		(await ctx.kv.get<string>("settings:siteUrl")) ??
		"https://practicaltravelgear.com";
	const autoContentTasksEnabled =
		(await ctx.kv.get<boolean>("settings:autoContentTasksEnabled")) ?? false;
	const autoContentDestinationId =
		(await ctx.kv.get<string>("settings:autoContentDestinationId")) ??
		defaultDestinationId;
	const autoContentTaskType =
		(await ctx.kv.get<string>("settings:autoContentTaskType")) ??
		"writing.revision";
	const includeContentSummary =
		(await ctx.kv.get<boolean>("settings:includeContentSummary")) ?? true;
	const autoContentCollections =
		(await ctx.kv.get<string>("settings:autoContentCollections")) ?? "";
	const autoTaskInstructions =
		(await ctx.kv.get<string>("settings:autoTaskInstructions")) ??
		"Review this content update and create any follow-up optimization, editorial, or QA work needed.";

	return {
		blocks: [
			{ type: "header", text: "Hyperagent Settings" },
			{
				type: "context",
				text: "Send manual and content-triggered tasks to Hyperagent by webhook.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "hyperagent-settings",
				fields: [
					{
						type: "text_input",
						action_id: "destinationsJson",
						label: "Webhook Destinations",
						initial_value: destinationsJson,
						multiline: true,
					},
					{
						type: "text_input",
						action_id: "defaultDestinationId",
						label: "Default Destination ID",
						initial_value: defaultDestinationId,
						placeholder: "seo",
					},
					{
						type: "text_input",
						action_id: "workspaceId",
						label: "Workspace ID",
						initial_value: workspaceId,
						placeholder: "workspace_...",
					},
					{
						type: "text_input",
						action_id: "agentId",
						label: "Agent ID",
						initial_value: agentId,
						placeholder: "agent_...",
					},
					{
						type: "text_input",
						action_id: "sourceName",
						label: "Source Name",
						initial_value: sourceName,
					},
					{
						type: "text_input",
						action_id: "siteUrl",
						label: "Site URL",
						initial_value: siteUrl,
						placeholder: "https://practicaltravelgear.com",
					},
					{
						type: "toggle",
						action_id: "autoContentTasksEnabled",
						label: "Create a Hyperagent task when content is saved",
						initial_value: autoContentTasksEnabled,
					},
					{
						type: "select",
						action_id: "autoContentDestinationId",
						label: "Content Save Destination",
						options,
						initial_value: autoContentDestinationId,
					},
					{
						type: "text_input",
						action_id: "autoContentCollections",
						label: "Auto-Task Collections",
						initial_value: autoContentCollections,
						placeholder: "posts, guides (blank = all collections)",
					},
					{
						type: "text_input",
						action_id: "autoContentTaskType",
						label: "Content Save Task Type",
						initial_value: autoContentTaskType,
						placeholder: "writing.revision",
					},
					{
						type: "toggle",
						action_id: "includeContentSummary",
						label: "Include content summary in task context",
						initial_value: includeContentSummary,
					},
					{
						type: "text_input",
						action_id: "autoTaskInstructions",
						label: "Automatic Task Instructions",
						initial_value: autoTaskInstructions,
						multiline: true,
					},
				],
				submit: {
					label: "Save Settings",
					action_id: "save_hyperagent_settings",
				},
			},
			{ type: "divider" },
			{
				type: "fields",
				fields: [
					{
						label: "Connection",
						value: destinations.some((destination) => destination.webhookUrl)
							? "Configured"
							: "Not configured",
					},
					{ label: "Destinations", value: String(destinations.length) },
					{ label: "Default Destination", value: defaultDestinationId },
					{ label: "Workspace", value: workspaceId || "Not set" },
					{ label: "Agent", value: agentId || "Not set" },
					{
						label: "Automatic Tasks",
						value: autoContentTasksEnabled ? "Enabled" : "Disabled",
					},
					{
						label: "Collection Filter",
						value: autoContentCollections || "All collections",
					},
				],
			},
		],
	};
}

export async function saveSettings(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	if (typeof values.destinationsJson === "string") {
		const validationError = validateDestinationsJson(values.destinationsJson);
		if (validationError) {
			return {
				...(await buildSettingsPage(ctx)),
				toast: {
					message: validationError,
					type: "error" as const,
				},
			};
		}
	}

	if (typeof values.destinationsJson === "string")
		await ctx.kv.set("settings:destinationsJson", values.destinationsJson.trim());
	if (typeof values.defaultDestinationId === "string")
		await ctx.kv.set(
			"settings:defaultDestinationId",
			values.defaultDestinationId.trim(),
		);
	if (typeof values.workspaceId === "string")
		await ctx.kv.set("settings:workspaceId", values.workspaceId.trim());
	if (typeof values.agentId === "string")
		await ctx.kv.set("settings:agentId", values.agentId.trim());
	if (typeof values.sourceName === "string")
		await ctx.kv.set("settings:sourceName", values.sourceName.trim());
	if (typeof values.siteUrl === "string")
		await ctx.kv.set("settings:siteUrl", values.siteUrl.trim());
	if (typeof values.autoContentTasksEnabled === "boolean")
		await ctx.kv.set(
			"settings:autoContentTasksEnabled",
			values.autoContentTasksEnabled,
		);
	if (typeof values.autoContentDestinationId === "string")
		await ctx.kv.set(
			"settings:autoContentDestinationId",
			values.autoContentDestinationId.trim(),
		);
	if (typeof values.autoContentCollections === "string")
		await ctx.kv.set(
			"settings:autoContentCollections",
			values.autoContentCollections.trim(),
		);
	if (typeof values.autoContentTaskType === "string")
		await ctx.kv.set(
			"settings:autoContentTaskType",
			values.autoContentTaskType.trim(),
		);
	if (typeof values.includeContentSummary === "boolean")
		await ctx.kv.set("settings:includeContentSummary", values.includeContentSummary);
	if (typeof values.autoTaskInstructions === "string")
		await ctx.kv.set(
			"settings:autoTaskInstructions",
			values.autoTaskInstructions.trim(),
		);

	return {
		...(await buildSettingsPage(ctx)),
		toast: { message: "Settings saved", type: "success" as const },
	};
}

function validateDestinationsJson(value: string): string | null {
	try {
		const parsed = JSON.parse(value);
		if (!Array.isArray(parsed)) return "Webhook destinations must be a JSON array";
	} catch {
		return "Webhook destinations JSON is invalid";
	}

	const destinations = parseDestinations(value);
	for (const destination of destinations) {
		if (destination.webhookUrl && !isHyperagentWebhookUrl(destination.webhookUrl)) {
			return `${destination.label} webhook must use HTTPS on hyperagent.com or a hyperagent.com subdomain`;
		}
	}

	return null;
}
