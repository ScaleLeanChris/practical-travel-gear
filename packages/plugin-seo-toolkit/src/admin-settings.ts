import type { PluginContext } from "emdash";

export async function buildSettingsPage(ctx: PluginContext) {
	const login = (await ctx.kv.get<string>("settings:dataforseoLogin")) ?? "";
	const domain = (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
	const autoRefresh = (await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
	const lastRefresh = await ctx.kv.get<string>("settings:lastRefresh");

	return {
		blocks: [
			{ type: "header", text: "SEO Settings" },
			{ type: "divider" },
			{
				type: "form",
				block_id: "seo-settings",
				fields: [
					{
						type: "text_input",
						action_id: "dataforseoLogin",
						label: "DataForSEO Login (email)",
						initial_value: login,
					},
					{
						type: "secret_input",
						action_id: "dataforseoPassword",
						label: "DataForSEO Password",
					},
					{
						type: "text_input",
						action_id: "domain",
						label: "Target Domain",
						initial_value: domain,
					},
					{
						type: "toggle",
						action_id: "autoRefresh",
						label: "Weekly Auto-Refresh",
						initial_value: autoRefresh,
					},
				],
				submit: { label: "Save Settings", action_id: "save_seo_settings" },
			},
			{ type: "divider" },
			{
				type: "fields",
				fields: [
					{ label: "Status", value: login ? "Configured" : "Not Configured" },
					{ label: "Domain", value: domain },
					{ label: "Last Refresh", value: lastRefresh ?? "Never" },
				],
			},
			{ type: "divider" },
			{
				type: "actions",
				elements: [
					{
						type: "button",
						text: "Refresh Data Now",
						action_id: "refresh_data",
						style: "primary",
					},
					{
						type: "button",
						text: "Run Content Audit",
						action_id: "run_audit",
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
	if (typeof values.dataforseoLogin === "string" && values.dataforseoLogin.trim())
		await ctx.kv.set("settings:dataforseoLogin", values.dataforseoLogin.trim());
	if (typeof values.dataforseoPassword === "string" && values.dataforseoPassword !== "")
		await ctx.kv.set("settings:dataforseoPassword", values.dataforseoPassword);
	if (typeof values.domain === "string" && values.domain.trim())
		await ctx.kv.set("settings:domain", values.domain.trim());
	if (typeof values.autoRefresh === "boolean")
		await ctx.kv.set("settings:autoRefresh", values.autoRefresh);

	return {
		...(await buildSettingsPage(ctx)),
		toast: { message: "Settings saved", type: "success" as const },
	};
}
