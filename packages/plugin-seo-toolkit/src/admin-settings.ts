import type { PluginContext } from "emdash";

export async function buildSettingsTab(ctx: PluginContext): Promise<any[]> {
	const login = (await ctx.kv.get<string>("settings:dataforseoLogin")) ?? "";
	const domain = (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
	const autoRefresh = (await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
	const lastRefresh = await ctx.kv.get<string>("settings:lastRefresh");
	const hasPassword = !!(await ctx.kv.get<string>("settings:dataforseoPassword"));
	const hyperagentWebhookUrl = (await ctx.kv.get<string>("settings:hyperagentWebhookUrl")) ?? "";
	const hasWebhookSecret = !!(await ctx.kv.get<string>("settings:hyperagentWebhookSecret"));

	return [
		{ type: "header", text: "Settings" },
		{
			type: "context",
			text: "Connect your DataForSEO account to track keyword rankings, backlinks, and broken inbound links.",
		},
		{ type: "divider" },
		{
			type: "form",
			block_id: "seo-settings",
			fields: [
				{
					type: "text_input",
					action_id: "dataforseoLogin",
					label: "DataForSEO Login Email",
					initial_value: login,
					placeholder: "you@example.com",
				},
				{
					type: "secret_input",
					action_id: "dataforseoPassword",
					label: hasPassword ? "DataForSEO API Password (saved)" : "DataForSEO API Password",
					placeholder: hasPassword ? "Password saved \u2014 leave blank to keep" : "From app.dataforseo.com dashboard",
				},
				{
					type: "text_input",
					action_id: "domain",
					label: "Your Domain (what DataForSEO tracks)",
					initial_value: domain,
					placeholder: "example.com",
				},
				{
					type: "toggle",
					action_id: "autoRefresh",
					label: "Auto-refresh data weekly (rankings, backlinks, audit)",
					initial_value: autoRefresh,
				},
				{
					type: "text_input",
					action_id: "hyperagentWebhookUrl",
					label: "HyperAgent Webhook URL",
					initial_value: hyperagentWebhookUrl,
					placeholder: "https://hyperagent.com/api/webhooks/.../receive",
				},
				{
					type: "secret_input",
					action_id: "hyperagentWebhookSecret",
					label: hasWebhookSecret ? "HyperAgent Webhook Secret (saved)" : "HyperAgent Webhook Secret",
					placeholder: hasWebhookSecret ? "Secret saved — leave blank to keep" : "From HyperAgent webhook settings",
				},
			],
			submit: { label: "Save Settings", action_id: "save_seo_settings" },
		},
		{ type: "divider" },
		{
			type: "stats",
			items: [
				{ label: "Status", value: login ? "Configured" : "Not Configured" },
				{ label: "Domain", value: domain },
				{ label: "Last Refresh", value: lastRefresh ?? "Never" },
			],
		},
	];
}

export async function saveSettings(
	ctx: PluginContext,
	values: Record<string, unknown>,
): Promise<void> {
	if (typeof values.dataforseoLogin === "string" && values.dataforseoLogin.trim())
		await ctx.kv.set("settings:dataforseoLogin", values.dataforseoLogin.trim());
	if (typeof values.dataforseoPassword === "string" && values.dataforseoPassword !== "")
		await ctx.kv.set("settings:dataforseoPassword", values.dataforseoPassword);
	if (typeof values.domain === "string" && values.domain.trim())
		await ctx.kv.set("settings:domain", values.domain.trim());
	if (typeof values.autoRefresh === "boolean")
		await ctx.kv.set("settings:autoRefresh", values.autoRefresh);
	if (typeof values.hyperagentWebhookUrl === "string" && values.hyperagentWebhookUrl.trim())
		await ctx.kv.set("settings:hyperagentWebhookUrl", values.hyperagentWebhookUrl.trim());
	if (typeof values.hyperagentWebhookSecret === "string" && values.hyperagentWebhookSecret !== "")
		await ctx.kv.set("settings:hyperagentWebhookSecret", values.hyperagentWebhookSecret);
}
