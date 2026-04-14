import type { PluginContext } from "emdash";

export async function buildSettingsPage(ctx: PluginContext) {
	const apiBase =
		(await ctx.kv.get<string>("settings:apiBase")) ?? "";
	const companyId =
		(await ctx.kv.get<string>("settings:companyId")) ?? "";
	const agentId =
		(await ctx.kv.get<string>("settings:agentId")) ?? "";
	const apiKey = await ctx.kv.get<string>("settings:apiKey");
	const eventsEnabled =
		(await ctx.kv.get<boolean>("settings:eventsEnabled")) ?? true;
	const seoDigestEnabled =
		(await ctx.kv.get<boolean>("settings:seoDigestEnabled")) ?? true;
	const inboundSecret = await ctx.kv.get<string>("settings:inboundSecret");

	return {
		blocks: [
			{ type: "header", text: "Paperclip Settings" },
			{
				type: "context",
				text: "Connect this site to your Paperclip instance for AI agent orchestration.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "paperclip-settings",
				fields: [
					{
						type: "text_input",
						action_id: "apiBase",
						label: "Paperclip API URL",
						initial_value: apiBase,
						placeholder: "http://localhost:3100",
					},
					{
						type: "secret_input",
						action_id: "apiKey",
						label: "Paperclip API Key",
						placeholder: "pk_...",
					},
					{
						type: "text_input",
						action_id: "companyId",
						label: "Company ID",
						initial_value: companyId,
						placeholder: "company_...",
					},
					{
						type: "text_input",
						action_id: "agentId",
						label: "Agent ID",
						initial_value: agentId,
						placeholder: "agent_...",
					},
					{
						type: "secret_input",
						action_id: "inboundSecret",
						label: "Inbound API Secret",
						placeholder: "Shared secret for Paperclip -> EmDash calls",
					},
					{
						type: "toggle",
						action_id: "eventsEnabled",
						label: "Send content events to Paperclip",
						initial_value: eventsEnabled,
					},
					{
						type: "toggle",
						action_id: "seoDigestEnabled",
						label: "Send weekly SEO digest",
						initial_value: seoDigestEnabled,
					},
				],
				submit: {
					label: "Save Settings",
					action_id: "save_paperclip_settings",
				},
			},
			{ type: "divider" },
			{
				type: "fields",
				fields: [
					{
						label: "Connection",
						value: apiBase && apiKey ? "Configured" : "Not Configured",
					},
					{ label: "API URL", value: apiBase || "Not set" },
					{ label: "Company", value: companyId || "Not set" },
					{ label: "Agent", value: agentId || "Not set" },
					{
						label: "Inbound API",
						value: inboundSecret ? "Secret configured" : "No secret (disabled)",
					},
				],
			},
			{ type: "divider" },
			{
				type: "actions",
				elements: [
					{
						type: "button",
						text: "Test Connection",
						action_id: "test_connection",
						style: "primary",
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
	if (typeof values.apiBase === "string" && values.apiBase.trim())
		await ctx.kv.set("settings:apiBase", values.apiBase.trim());
	if (typeof values.apiKey === "string" && values.apiKey !== "")
		await ctx.kv.set("settings:apiKey", values.apiKey);
	if (typeof values.companyId === "string")
		await ctx.kv.set("settings:companyId", values.companyId.trim());
	if (typeof values.agentId === "string")
		await ctx.kv.set("settings:agentId", values.agentId.trim());
	if (typeof values.inboundSecret === "string" && values.inboundSecret !== "")
		await ctx.kv.set("settings:inboundSecret", values.inboundSecret);
	if (typeof values.eventsEnabled === "boolean")
		await ctx.kv.set("settings:eventsEnabled", values.eventsEnabled);
	if (typeof values.seoDigestEnabled === "boolean")
		await ctx.kv.set("settings:seoDigestEnabled", values.seoDigestEnabled);

	return {
		...(await buildSettingsPage(ctx)),
		toast: { message: "Settings saved", type: "success" as const },
	};
}
