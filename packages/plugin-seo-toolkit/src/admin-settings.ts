import type { PluginContext } from "emdash";

export async function buildSettingsPage(ctx: PluginContext) {
	const login = (await ctx.kv.get<string>("settings:dataforseoLogin")) ?? "";
	const domain = (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
	const autoRefresh = (await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
	const lastRefresh = await ctx.kv.get<string>("settings:lastRefresh");

	return {
		blocks: [
			{ type: "header", text: "SEO Settings" },
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
						label: "DataForSEO API Password",
						placeholder: "From app.dataforseo.com dashboard",
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
			{ type: "header", text: "Actions" },
			{
				type: "section",
				text: "**Fetch Rankings & Backlinks** — Pull the latest keyword rankings, backlink profile, and broken inbound links from DataForSEO. Uses 4-5 API calls.",
				accessory: { type: "button", text: "Refresh Data", action_id: "refresh_data" },
			},
			{
				type: "section",
				text: "**Scan Content for SEO Issues** — Audit all published posts and pages for missing descriptions, thin content, duplicate titles, missing alt text, and more.",
				accessory: { type: "button", text: "Run Audit", action_id: "run_audit" },
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
