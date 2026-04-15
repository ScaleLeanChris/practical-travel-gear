import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";

// ---------------------------------------------------------------------------
// Branded email config — shared shape for all email types
// ---------------------------------------------------------------------------

interface BrandConfig {
	siteName: string;
	headerColor: string;
	footerText: string;
}

interface EmailTemplateConfig {
	heading: string;
	bodyText: string;
	disclaimer: string;
}

interface InviteConfig extends BrandConfig, EmailTemplateConfig {
	subject: string;
}

interface MagicLinkConfig extends EmailTemplateConfig {}
interface SignupConfig extends EmailTemplateConfig {}

const DEFAULT_BRAND: BrandConfig = {
	siteName: "Practical Travel Gear",
	headerColor: "#1a3a2a",
	footerText:
		"PracticalTravelGear.com — Honest reviews and guides for travelers who pack smart.",
};

const DEFAULT_INVITE: InviteConfig = {
	...DEFAULT_BRAND,
	heading: "You've been invited",
	bodyText:
		"Someone on the PracticalTravelGear.com team has invited you to join as a contributor. Use the link below to set up your account and get started.\n\nYou'll be prompted to create a passkey — a secure login using your device's fingerprint, Face ID, or PIN. No password needed.",
	disclaimer:
		"If you weren't expecting this invitation, you can safely ignore this email.",
	subject: "You're invited to join Practical Travel Gear",
};

const DEFAULT_MAGIC_LINK: MagicLinkConfig = {
	heading: "Sign in to your account",
	bodyText:
		"Click the button below to sign in. This link expires in 15 minutes.\n\nThis site uses passkeys instead of passwords. After signing in, you can set up a passkey in your account settings — a secure login using your device's fingerprint, Face ID, or PIN. Once set up, you can sign in instantly without needing an email link.",
	disclaimer:
		"If you didn't request this, you can safely ignore this email.",
};

const DEFAULT_SIGNUP: SignupConfig = {
	heading: "Verify your email",
	bodyText:
		"Click the button below to verify your email and create your account.\n\nOnce verified, you'll set up a passkey to sign in securely. A passkey uses your device's fingerprint, Face ID, or PIN — no password needed.",
	disclaimer:
		"If you didn't request this, you can safely ignore this email.",
};

async function getInviteConfig(ctx: PluginContext): Promise<InviteConfig> {
	const stored = await ctx.kv.get<Partial<InviteConfig>>("settings:invite");
	return { ...DEFAULT_INVITE, ...stored };
}

async function getMagicLinkConfig(
	ctx: PluginContext,
): Promise<MagicLinkConfig> {
	const stored =
		await ctx.kv.get<Partial<MagicLinkConfig>>("settings:magiclink");
	return { ...DEFAULT_MAGIC_LINK, ...stored };
}

async function getSignupConfig(ctx: PluginContext): Promise<SignupConfig> {
	const stored = await ctx.kv.get<Partial<SignupConfig>>("settings:signup");
	return { ...DEFAULT_SIGNUP, ...stored };
}

// ---------------------------------------------------------------------------
// Branded HTML / text builders (shared across all email types)
// ---------------------------------------------------------------------------

function buildBrandedHtml(
	brand: BrandConfig,
	template: EmailTemplateConfig,
	innerHtml: string,
): string {
	const bodyHtml = template.bodyText
		.split("\n\n")
		.map(
			(p) =>
				`<p style="margin:0 0 16px; color:#4a4a4a; font-size:16px; line-height:1.6;">${p}</p>`,
		)
		.join("\n            ");

	return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8" /></head>
<body style="margin:0; padding:0; background:#f4f1ec; font-family:'Georgia','Times New Roman',serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f1ec; padding:40px 20px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:${brand.headerColor}; padding:32px 40px; text-align:center;">
            <h1 style="margin:0; color:#ffffff; font-size:24px; font-weight:normal; letter-spacing:1px;">
              ${brand.siteName}
            </h1>
          </td>
        </tr>
        <tr>
          <td style="padding:40px;">
            <h2 style="margin:0 0 16px; color:${brand.headerColor}; font-size:22px; font-weight:normal;">
              ${template.heading}
            </h2>
            ${bodyHtml}
            ${innerHtml}
            <p style="margin:24px 0 0; color:#888888; font-size:13px; line-height:1.5;">
              ${template.disclaimer}
            </p>
          </td>
        </tr>
        <tr>
          <td style="background:#f9f7f4; padding:20px 40px; text-align:center; border-top:1px solid #e8e4de;">
            <p style="margin:0; color:#999999; font-size:12px;">
              ${brand.footerText}
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function buildBrandedText(
	brand: BrandConfig,
	template: EmailTemplateConfig,
	innerText: string,
): string {
	return `${template.heading}\n\n${template.bodyText}\n\n${innerText}\n\n${template.disclaimer}\n\n--\n${brand.footerText}`;
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
	const magicLink = await getMagicLinkConfig(ctx);
	const signup = await getSignupConfig(ctx);

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
				text: "Customize the email sent when inviting new users. Includes passkey setup instructions by default.",
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
						label: "Site Name (shown in header of all emails)",
						initial_value: invite.siteName,
					},
					{
						type: "text_input",
						action_id: "headerColor",
						label: "Header Color (hex, used in all emails)",
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
						label: "Footer Text (used in all emails)",
						initial_value: invite.footerText,
					},
					{
						type: "text_input",
						action_id: "disclaimer",
						label: "Disclaimer",
						initial_value: invite.disclaimer,
					},
				],
				submit: { label: "Save Template", action_id: "save_invite" },
			},
			{ type: "divider" },
			{ type: "header", text: "Sign-In Email Template" },
			{
				type: "context",
				text: "Customize the magic link email sent when users sign in or recover their account.",
			},
			{
				type: "form",
				block_id: "agentmail-magiclink",
				fields: [
					{
						type: "text_input",
						action_id: "heading",
						label: "Heading",
						initial_value: magicLink.heading,
					},
					{
						type: "text_input",
						action_id: "bodyText",
						label: "Body Text",
						initial_value: magicLink.bodyText,
					},
					{
						type: "text_input",
						action_id: "disclaimer",
						label: "Disclaimer",
						initial_value: magicLink.disclaimer,
					},
				],
				submit: { label: "Save Template", action_id: "save_magiclink" },
			},
			{ type: "divider" },
			{ type: "header", text: "Signup Verification Template" },
			{
				type: "context",
				text: "Customize the verification email sent when new users sign up via an allowed domain.",
			},
			{
				type: "form",
				block_id: "agentmail-signup",
				fields: [
					{
						type: "text_input",
						action_id: "heading",
						label: "Heading",
						initial_value: signup.heading,
					},
					{
						type: "text_input",
						action_id: "bodyText",
						label: "Body Text",
						initial_value: signup.bodyText,
					},
					{
						type: "text_input",
						action_id: "disclaimer",
						label: "Disclaimer",
						initial_value: signup.disclaimer,
					},
				],
				submit: { label: "Save Template", action_id: "save_signup" },
			},
			{ type: "divider" },
			{ type: "header", text: "Send Test Email" },
			{
				type: "context",
				text: "Send a test email to preview how different email types look with your branding.",
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
							{ label: "Sign-in link preview", value: "magiclink" },
							{
								label: "Signup verification preview",
								value: "signup",
							},
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
		"disclaimer",
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

async function saveMagicLinkConfig(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	const current = await getMagicLinkConfig(ctx);
	const updated: MagicLinkConfig = { ...current };

	for (const key of ["heading", "bodyText", "disclaimer"] as const) {
		if (typeof values[key] === "string" && values[key].trim() !== "") {
			updated[key] = values[key].trim();
		}
	}

	await ctx.kv.set("settings:magiclink", updated);

	return {
		...(await buildSettingsPage(ctx)),
		toast: { message: "Sign-in template saved", type: "success" as const },
	};
}

async function saveSignupConfig(
	ctx: PluginContext,
	values: Record<string, unknown>,
) {
	const current = await getSignupConfig(ctx);
	const updated: SignupConfig = { ...current };

	for (const key of ["heading", "bodyText", "disclaimer"] as const) {
		if (typeof values[key] === "string" && values[key].trim() !== "") {
			updated[key] = values[key].trim();
		}
	}

	await ctx.kv.set("settings:signup", updated);

	return {
		...(await buildSettingsPage(ctx)),
		toast: {
			message: "Signup verification template saved",
			type: "success" as const,
		},
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

	const testType =
		typeof values.testType === "string" ? values.testType : "basic";

	let subject: string;
	let text: string;
	let html: string;
	let label: string;

	const invite = await getInviteConfig(ctx);
	const brand: BrandConfig = {
		siteName: invite.siteName,
		headerColor: invite.headerColor,
		footerText: invite.footerText,
	};

	const placeholderUrl = "https://practicaltravelgear.com/_emdash/admin/example?token=preview-test";
	const ctaHtml = (btnText: string) =>
		`<p style="margin:30px 0;"><a href="${placeholderUrl}" style="display:inline-block; padding:12px 24px; background:${brand.headerColor}; color:#ffffff; text-decoration:none; border-radius:4px; font-size:16px;">${btnText}</a></p>`;

	if (testType === "invite") {
		subject = invite.subject;
		html = buildBrandedHtml(brand, invite, ctaHtml("Accept Invitation"));
		text = buildBrandedText(brand, invite, placeholderUrl);
		label = "Invite preview";
	} else if (testType === "magiclink") {
		const mlConfig = await getMagicLinkConfig(ctx);
		subject = `Sign in to ${brand.siteName}`;
		html = buildBrandedHtml(brand, mlConfig, ctaHtml("Sign In"));
		text = buildBrandedText(brand, mlConfig, placeholderUrl);
		label = "Sign-in preview";
	} else if (testType === "signup") {
		const suConfig = await getSignupConfig(ctx);
		subject = `Verify your email for ${brand.siteName}`;
		html = buildBrandedHtml(brand, suConfig, ctaHtml("Verify Email"));
		text = buildBrandedText(brand, suConfig, placeholderUrl);
		label = "Signup verification preview";
	} else {
		subject = "Test Email from AgentMail Plugin";
		text = "This is a test email sent from the AgentMail EmDash plugin. If you received this, email delivery is working correctly.";
		html =
			"<p>This is a test email sent from the <strong>AgentMail EmDash plugin</strong>.</p><p>If you received this, email delivery is working correctly.</p>";
		label = "Test email";
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

// ---------------------------------------------------------------------------
// Extract CTA button from EmDash's default auth email HTML
// ---------------------------------------------------------------------------

function extractCtaHtml(html: string): string {
	const match = html.match(/<a\s+href="[^"]*"[^>]*>[^<]*<\/a>/i);
	if (!match) return "";
	return `<p style="margin:30px 0;">${match[0]}</p>`;
}

function extractCtaUrl(html: string): string {
	const match = html.match(/<a\s+href="([^"]*)"[^>]*>/i);
	return match?.[1] ?? "";
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

				// Brand system auth emails before delivery
				let finalMessage = { ...message };
				const subj: string = message.subject ?? "";

				const invite = await getInviteConfig(ctx);
				const brand: BrandConfig = {
					siteName: invite.siteName,
					headerColor: invite.headerColor,
					footerText: invite.footerText,
				};

				if (subj.startsWith("You've been invited to")) {
					const cta = extractCtaHtml(message.html ?? "");
					const ctaUrl = extractCtaUrl(message.html ?? "");
					finalMessage.subject = invite.subject;
					finalMessage.html = buildBrandedHtml(brand, invite, cta);
					finalMessage.text = buildBrandedText(brand, invite, ctaUrl);
				} else if (subj.startsWith("Sign in to")) {
					const mlConfig = await getMagicLinkConfig(ctx);
					const cta = extractCtaHtml(message.html ?? "");
					const ctaUrl = extractCtaUrl(message.html ?? "");
					finalMessage.html = buildBrandedHtml(brand, mlConfig, cta);
					finalMessage.text = buildBrandedText(brand, mlConfig, ctaUrl);
				} else if (subj.startsWith("Verify your email for")) {
					const suConfig = await getSignupConfig(ctx);
					const cta = extractCtaHtml(message.html ?? "");
					const ctaUrl = extractCtaUrl(message.html ?? "");
					finalMessage.html = buildBrandedHtml(brand, suConfig, cta);
					finalMessage.text = buildBrandedText(brand, suConfig, ctaUrl);
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
						to: finalMessage.to,
						subject: finalMessage.subject,
						text: finalMessage.text,
						html: finalMessage.html,
					}),
				});

				if (!response.ok) {
					const body = await response.text();
					ctx.log.error("AgentMail delivery failed", {
						status: response.status,
						body,
						to: finalMessage.to,
					});
					throw new Error(`AgentMail API error ${response.status}: ${body}`);
				}

				ctx.log.info("Email delivered via AgentMail", {
					to: finalMessage.to,
				});
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
					interaction.action_id === "save_magiclink"
				) {
					return saveMagicLinkConfig(ctx, interaction.values ?? {});
				}

				if (
					interaction.type === "form_submit" &&
					interaction.action_id === "save_signup"
				) {
					return saveSignupConfig(ctx, interaction.values ?? {});
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
