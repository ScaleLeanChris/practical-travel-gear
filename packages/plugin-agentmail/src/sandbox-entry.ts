import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

interface InviteConfig {
	siteName: string;
	headerColor: string;
	heading: string;
	bodyText: string;
	footerText: string;
	subject: string;
}

const DEFAULT_INVITE: InviteConfig = {
	siteName: "Practical Travel Gear",
	headerColor: "#1a3a2a",
	heading: "You've been invited",
	bodyText:
		"Someone on the PracticalTravelGear.com team has invited you to join as a contributor. Use the link below to set up your account and get started.",
	footerText:
		"PracticalTravelGear.com — Honest reviews and guides for travelers who pack smart.",
	subject: "You're invited to join Practical Travel Gear",
};

async function getInviteConfig(ctx: PluginContext): Promise<InviteConfig> {
	const stored = await ctx.kv.get<Partial<InviteConfig>>("settings:invite");
	return { ...DEFAULT_INVITE, ...stored };
}

function buildInviteHtml(config: InviteConfig, innerHtml: string): string {
	return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0; padding:0; background:#f4f1ec; font-family:'Georgia','Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec; padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:${config.headerColor}; padding:32px 40px; text-align:center;">
            <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:normal; letter-spacing:1px;">
              ${config.siteName}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px; color:${config.headerColor}; font-size:22px; font-weight:normal;">
              ${config.heading}
            </h2>
            <p style="margin:0 0 24px; color:#4a4a4a; font-size:16px; line-height:1.6;">
              ${config.bodyText}
            </p>
            ${innerHtml}
            <p style="margin:24px 0 0; color:#888888; font-size:13px; line-height:1.5;">
              If you weren't expecting this invitation, you can safely ignore this email.
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f7f4; padding:20px 40px; text-align:center; border-top:1px solid #e8e4de;">
            <p style="margin:0; color:#999999; font-size:12px;">
              ${config.footerText}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildInviteText(config: InviteConfig, innerText: string): string {
	return `${config.heading}\n\n${config.bodyText}\n\n${innerText}\n\nIf you weren't expecting this invitation, you can safely ignore this email.\n\n--\n${config.footerText}`;
}

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
	const invite = await getInviteConfig(ctx);

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
			{ type: "header", text: "Invite Email Template" },
			{
				type: "context",
				text: "Customize the email sent when inviting new users to the site.",
			},
			{
				type: "form",
				block_id: "agentmail-invite",
				fields: [
					{
						type: "text_input",
						action_id: "subject",
						label: "Subject Line",
						initial_value: invite.subject,
					},
					{
						type: "text_input",
						action_id: "siteName",
						label: "Site Name (shown in header)",
						initial_value: invite.siteName,
					},
					{
						type: "text_input",
						action_id: "headerColor",
						label: "Header Color (hex)",
						initial_value: invite.headerColor,
						placeholder: "#1a3a2a",
					},
					{
						type: "text_input",
						action_id: "heading",
						label: "Heading",
						initial_value: invite.heading,
					},
					{
						type: "text_input",
						action_id: "bodyText",
						label: "Body Text",
						initial_value: invite.bodyText,
					},
					{
						type: "text_input",
						action_id: "footerText",
						label: "Footer Text",
						initial_value: invite.footerText,
					},
				],
				submit: { label: "Save Template", action_id: "save_invite" },
			},
			{ type: "divider" },
			{ type: "header", text: "Send Test Email" },
			{
				type: "context",
				text: "Send a test email through the full email pipeline. Choose a type to preview how different emails look.",
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
					{
						type: "select",
						action_id: "testType",
						label: "Email Type",
						options: [
							{ label: "Basic delivery test", value: "basic" },
							{ label: "User invite preview", value: "invite" },
						],
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

async function saveInviteConfig(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	const current = await getInviteConfig(ctx);
	const updated: InviteConfig = { ...current };

	for (const key of [
		"subject",
		"siteName",
		"headerColor",
		"heading",
		"bodyText",
		"footerText",
	] as const) {
		if (typeof values[key] === "string" && values[key].trim() !== "") {
			updated[key] = values[key].trim();
		}
	}

	await ctx.kv.set("settings:invite", updated);

	return {
		...(await buildSettingsPage(ctx)),
		toast: { message: "Invite template saved", type: "success" as const },
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

	const testType = typeof values.testType === "string" ? values.testType : "basic";
	const isInvite = testType === "invite";

	let subject: string;
	let text: string;
	let html: string;

	if (isInvite) {
		const invite = await getInviteConfig(ctx);
		const placeholderLink =
			'<p><a href="https://practicaltravelgear.com/_emdash/admin/accept-invite?token=preview-test" style="display:inline-block; padding:12px 24px; background:#1a3a2a; color:#ffffff; text-decoration:none; border-radius:4px; font-size:16px;">Accept Invitation</a></p>';
		const placeholderText =
			"https://practicaltravelgear.com/_emdash/admin/accept-invite?token=preview-test";

		subject = invite.subject;
		html = buildInviteHtml(invite, placeholderLink);
		text = buildInviteText(invite, placeholderText);
	} else {
		subject = "Test Email from AgentMail Plugin";
		text = "This is a test email sent from the AgentMail EmDash plugin. If you received this, email delivery is working correctly.";
		html = "<p>This is a test email sent from the <strong>AgentMail EmDash plugin</strong>.</p><p>If you received this, email delivery is working correctly.</p>";
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
			body: JSON.stringify({ to: recipient, subject, text, html }),
		});

		if (!response.ok) {
			const body = await response.text();
			return {
				...(await buildSettingsPage(ctx)),
				toast: { message: `Failed: ${body}`, type: "error" as const },
			};
		}

		const label = isInvite ? "Invite preview" : "Test email";
		return {
			...(await buildSettingsPage(ctx)),
			toast: {
				message: `${label} sent to ${recipient}`,
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
		"email:beforeSend": async (event: any, ctx: PluginContext) => {
			const { message, source } = event;
			if (source !== "user:invite") return message;

			const invite = await getInviteConfig(ctx);

			return {
				...message,
				subject: invite.subject,
				html: buildInviteHtml(invite, message.html),
				text: buildInviteText(invite, message.text),
			};
		},

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
					interaction.action_id === "save_invite"
				) {
					return saveInviteConfig(ctx, interaction.values ?? {});
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
