import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

async function getConfig(ctx: PluginContext) {
	return {
		apiKey: await ctx.kv.get<string>("settings:apiKey"),
		inboxId: await ctx.kv.get<string>("settings:inboxId"),
	};
}

function getFetchFn(ctx: PluginContext) {
	if (!ctx.http) throw new Error("AgentMail requires network:fetch capability");
	return ctx.http.fetch;
}

async function buildSettingsPage(ctx: PluginContext) {
	const apiKey = (await ctx.kv.get<string>("settings:apiKey")) ?? "";
	const inboxId = (await ctx.kv.get<string>("settings:inboxId")) ?? "";

	return {
		blocks: [
			{ type: "header", text: "AgentMail Settings" },
			{
				type: "context",
				text: "Configure your AgentMail credentials for sending emails.",
			},
			{ type: "divider" },
			{
				type: "form",
				block_id: "agentmail-settings",
				fields: [
					{
						type: "secret_input",
						action_id: "apiKey",
						label: "API Key",
						placeholder: "am_...",
					},
					{
						type: "text_input",
						action_id: "inboxId",
						label: "Inbox ID",
						initial_value: inboxId,
						placeholder: "example@example.com",
					},
				],
				submit: { label: "Save Settings", action_id: "save_settings" },
			},
			{ type: "divider" },
			{
				type: "fields",
				fields: [
					{
						label: "Status",
						value: apiKey && inboxId ? "Configured" : "Not Configured",
					},
					{ label: "Inbox", value: inboxId || "None" },
				],
			},
			{ type: "divider" },
			{
				type: "section",
				text: "**Send Test Email**",
			},
			{
				type: "form",
				block_id: "agentmail-test",
				fields: [
					{
						type: "text_input",
						action_id: "testRecipient",
						label: "Recipient",
						placeholder: "you@example.com",
					},
				],
				submit: { label: "Send Test", action_id: "send_test" },
			},
		],
	};
}

async function saveSettings(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	if (typeof values.apiKey === "string" && values.apiKey !== "")
		await ctx.kv.set("settings:apiKey", values.apiKey);
	if (typeof values.inboxId === "string")
		await ctx.kv.set("settings:inboxId", values.inboxId);

	return {
		...(await buildSettingsPage(ctx)),
		toast: { message: "Settings saved", type: "success" as const },
	};
}

async function sendTestEmail(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	const recipient =
		typeof values.testRecipient === "string" ? values.testRecipient.trim() : "";
	if (!recipient) {
		return {
			...(await buildSettingsPage(ctx)),
			toast: { message: "Enter a recipient email address", type: "error" as const },
		};
	}

	const { apiKey, inboxId } = await getConfig(ctx);
	if (!apiKey || !inboxId) {
		return {
			...(await buildSettingsPage(ctx)),
			toast: {
				message: "Configure API Key and Inbox ID first",
				type: "error" as const,
			},
		};
	}

	try {
		const fetchFn = getFetchFn(ctx);
		const url = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`;

		const response = await fetchFn(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				to: recipient,
				subject: "Test Email from AgentMail Plugin",
				text: "This is a test email sent from the AgentMail EmDash plugin. If you received this, email delivery is working correctly.",
				html: "<p>This is a test email sent from the <strong>AgentMail EmDash plugin</strong>.</p><p>If you received this, email delivery is working correctly.</p>",
			}),
		});

		if (!response.ok) {
			const body = await response.text();
			return {
				...(await buildSettingsPage(ctx)),
				toast: {
					message: `Failed: ${body}`,
					type: "error" as const,
				},
			};
		}

		return {
			...(await buildSettingsPage(ctx)),
			toast: {
				message: `Test email sent to ${recipient}`,
				type: "success" as const,
			},
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : String(error);
		return {
			...(await buildSettingsPage(ctx)),
			toast: { message: `Failed: ${msg}`, type: "error" as const },
		};
	}
}

export default definePlugin({
	hooks: {
		"email:deliver": {
			exclusive: true,
			timeout: 30000,
			handler: async (event: any, ctx: PluginContext) => {
				const { message } = event;
				const { apiKey, inboxId } = await getConfig(ctx);

				if (!apiKey || !inboxId) {
					throw new Error(
						"AgentMail not configured — set API Key and Inbox ID in plugin settings",
					);
				}

				const fetchFn = getFetchFn(ctx);
				const url = `https://api.agentmail.to/v0/inboxes/${encodeURIComponent(inboxId)}/messages/send`;

				const response = await fetchFn(url, {
					method: "POST",
					headers: {
						Authorization: `Bearer ${apiKey}`,
						"Content-Type": "application/json",
					},
					body: JSON.stringify({
						to: message.to,
						subject: message.subject,
						text: message.text,
						html: message.html,
					}),
				});

				if (!response.ok) {
					const body = await response.text();
					ctx.log.error("AgentMail delivery failed", {
						status: response.status,
						body,
						to: message.to,
					});
					throw new Error(`AgentMail API error ${response.status}: ${body}`);
				}

				ctx.log.info("Email delivered via AgentMail", { to: message.to });
			},
		},
	},

	routes: {
		admin: {
			handler: async (routeCtx: any, ctx: PluginContext) => {
				const interaction = routeCtx.input;

				if (
					interaction.type === "page_load" &&
					interaction.page === "/settings"
				) {
					return buildSettingsPage(ctx);
				}

				if (
					interaction.type === "form_submit" &&
					interaction.action_id === "save_settings"
				) {
					return saveSettings(ctx, interaction.values ?? {});
				}

				if (
					interaction.type === "form_submit" &&
					interaction.action_id === "send_test"
				) {
					return sendTestEmail(ctx, interaction.values ?? {});
				}

				return { blocks: [] };
			},
		},
	},
});
