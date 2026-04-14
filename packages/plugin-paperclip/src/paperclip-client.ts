import type { PluginContext } from "emdash";

export interface PaperclipConfig {
	apiBase: string;
	apiKey: string;
	companyId: string;
	agentId: string;
}

export async function getConfig(
	ctx: PluginContext,
): Promise<PaperclipConfig | null> {
	const apiBase = await ctx.kv.get<string>("settings:apiBase");
	const apiKey = await ctx.kv.get<string>("settings:apiKey");
	const companyId = await ctx.kv.get<string>("settings:companyId");
	const agentId = await ctx.kv.get<string>("settings:agentId");

	if (!apiBase || !apiKey) return null;
	return {
		apiBase: apiBase.replace(/\/+$/, ""),
		apiKey,
		companyId: companyId ?? "",
		agentId: agentId ?? "",
	};
}

export async function postWebhook(
	ctx: PluginContext,
	config: PaperclipConfig,
	event: {
		type: string;
		collection?: string;
		entryId?: string;
		slug?: string;
		title?: string;
		seoScore?: number | null;
		data?: Record<string, unknown>;
	},
): Promise<{ ok: boolean; status?: number; error?: string }> {
	if (!ctx.http) {
		return { ok: false, error: "network:fetch capability not available" };
	}

	const url = `${config.apiBase}/api/plugins/webhooks/emdash-cms`;
	const payload = {
		source: "emdash",
		companyId: config.companyId,
		agentId: config.agentId,
		timestamp: new Date().toISOString(),
		...event,
	};

	try {
		const response = await ctx.http.fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const body = await response.text();
			return { ok: false, status: response.status, error: body };
		}
		return { ok: true, status: response.status };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

export async function postActivity(
	ctx: PluginContext,
	config: PaperclipConfig,
	message: string,
	metadata?: Record<string, unknown>,
): Promise<{ ok: boolean; error?: string }> {
	if (!ctx.http) {
		return { ok: false, error: "network:fetch capability not available" };
	}

	const url = `${config.apiBase}/api/activity`;
	const payload = {
		companyId: config.companyId,
		agentId: config.agentId,
		message,
		source: "emdash-plugin",
		metadata,
		timestamp: new Date().toISOString(),
	};

	try {
		const response = await ctx.http.fetch(url, {
			method: "POST",
			headers: {
				Authorization: `Bearer ${config.apiKey}`,
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});

		if (!response.ok) {
			const body = await response.text();
			return { ok: false, error: body };
		}
		return { ok: true };
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}
