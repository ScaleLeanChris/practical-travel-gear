import type { PluginContext } from "emdash";

export interface HyperagentConfig {
	destinations: HyperagentDestination[];
	defaultDestinationId: string;
	workspaceId: string;
	agentId: string;
	sourceName: string;
	siteUrl: string;
}

export interface HyperagentDestination {
	id: string;
	label: string;
	webhookUrl: string;
	webhookToken?: string;
	workspaceId?: string;
	agentId?: string;
	taskTypes?: string[];
}

export interface HyperagentTaskInput {
	source: "manual" | "content";
	taskType: string;
	destinationId?: string;
	title: string;
	instructions: string;
	priority?: "low" | "normal" | "high" | "urgent";
	contentUrl?: string;
	labels?: string[];
	context?: Record<string, unknown>;
}

export interface HyperagentTaskResult {
	ok: boolean;
	status?: number;
	error?: string;
	response?: unknown;
}

export const DEFAULT_DESTINATIONS_JSON = JSON.stringify(
	[
		{
			id: "seo",
			label: "SEO",
			webhookUrl: "",
			taskTypes: ["seo.optimize", "seo.analyze", "seo.audit"],
		},
		{
			id: "writing",
			label: "Writing",
			webhookUrl: "",
			taskTypes: ["writing.revision", "writing.new_content", "writing.brief"],
		},
		{
			id: "graphics",
			label: "Graphics",
			webhookUrl: "",
			taskTypes: ["graphics.content", "graphics.video", "graphics.thumbnail"],
		},
	],
	null,
	2,
);

export async function getConfig(
	ctx: PluginContext,
): Promise<HyperagentConfig | null> {
	const destinationsJson = await ctx.kv.get<string>("settings:destinationsJson");
	const defaultDestinationId =
		(await ctx.kv.get<string>("settings:defaultDestinationId")) ?? "seo";
	const workspaceId = await ctx.kv.get<string>("settings:workspaceId");
	const agentId = await ctx.kv.get<string>("settings:agentId");
	const sourceName = await ctx.kv.get<string>("settings:sourceName");
	const siteUrl = await ctx.kv.get<string>("settings:siteUrl");
	const legacyWebhookUrl = await ctx.kv.get<string>("settings:webhookUrl");
	const legacyWebhookToken = await ctx.kv.get<string>("settings:webhookToken");

	const destinations = parseDestinations(destinationsJson).filter(
		(destination) => destination.webhookUrl,
	);

	if (destinations.length === 0 && legacyWebhookUrl) {
		destinations.push({
			id: "default",
			label: "Default",
			webhookUrl: legacyWebhookUrl.trim(),
			webhookToken: legacyWebhookToken ?? "",
			workspaceId: workspaceId ?? "",
			agentId: agentId ?? "",
			taskTypes: ["general"],
		});
	}

	if (destinations.length === 0) return null;

	return {
		destinations,
		defaultDestinationId,
		workspaceId: workspaceId ?? "",
		agentId: agentId ?? "",
		sourceName: sourceName ?? "practical-travel-gear",
		siteUrl: (siteUrl ?? "https://practicaltravelgear.com").replace(/\/+$/, ""),
	};
}

export function parseDestinations(value: string | null | undefined): HyperagentDestination[] {
	const source = value?.trim() || DEFAULT_DESTINATIONS_JSON;
	let parsed: unknown;
	try {
		parsed = JSON.parse(source);
	} catch {
		return [];
	}

	if (!Array.isArray(parsed)) return [];

	return parsed
		.map((item) => normalizeDestination(item))
		.filter((item): item is HyperagentDestination => item !== null);
}

export function destinationOptions(destinations: HyperagentDestination[]) {
	if (destinations.length === 0) {
		return [{ label: "Default", value: "default" }];
	}

	return destinations.map((destination) => ({
		label: destination.label,
		value: destination.id,
	}));
}

export function getDestination(
	config: HyperagentConfig,
	destinationId?: string,
): HyperagentDestination {
	return (
		config.destinations.find((destination) => destination.id === destinationId) ??
		config.destinations.find(
			(destination) => destination.id === config.defaultDestinationId,
		) ??
		config.destinations[0]
	);
}

export function isHyperagentWebhookUrl(value: string): boolean {
	try {
		const url = new URL(value);
		return (
			url.protocol === "https:" &&
			(url.hostname === "hyperagent.com" ||
				url.hostname.endsWith(".hyperagent.com"))
		);
	} catch {
		return false;
	}
}

export async function postTaskToHyperagent(
	ctx: PluginContext,
	config: HyperagentConfig,
	destination: HyperagentDestination,
	task: HyperagentTaskInput,
): Promise<HyperagentTaskResult> {
	if (!ctx.http) {
		return { ok: false, error: "network:fetch capability not available" };
	}

	if (!isHyperagentWebhookUrl(destination.webhookUrl)) {
		return {
			ok: false,
			error: "Webhook URL must use HTTPS on hyperagent.com or a hyperagent.com subdomain",
		};
	}

	const payload = {
		event: "task.created",
		source: "emdash",
		sourcePlugin: "plugin-hyperagent",
		sourceName: config.sourceName,
		workspaceId: destination.workspaceId || config.workspaceId || undefined,
		agentId: destination.agentId || config.agentId || undefined,
		destination: {
			id: destination.id,
			label: destination.label,
		},
		timestamp: new Date().toISOString(),
		task: {
			type: task.taskType,
			title: task.title,
			instructions: task.instructions,
			priority: task.priority ?? "normal",
			contentUrl: task.contentUrl || undefined,
			labels: task.labels ?? [],
			context: task.context ?? {},
			source: task.source,
		},
	};

	const headers: Record<string, string> = {
		"Content-Type": "application/json",
		"X-EmDash-Plugin": "hyperagent",
	};
	if (destination.webhookToken) {
		headers.Authorization = `Bearer ${destination.webhookToken}`;
	}

	try {
		const response = await ctx.http.fetch(destination.webhookUrl, {
			method: "POST",
			headers,
			body: JSON.stringify(payload),
		});

		const responseText = await response.text();
		let responseBody: unknown = responseText;
		try {
			responseBody = responseText ? JSON.parse(responseText) : null;
		} catch {
			// Keep plain text response body.
		}

		if (!response.ok) {
			return {
				ok: false,
				status: response.status,
				error: typeof responseBody === "string" ? responseBody : response.statusText,
				response: responseBody,
			};
		}

		return {
			ok: true,
			status: response.status,
			response: responseBody,
		};
	} catch (err) {
		return {
			ok: false,
			error: err instanceof Error ? err.message : String(err),
		};
	}
}

function normalizeDestination(value: unknown): HyperagentDestination | null {
	if (!value || typeof value !== "object") return null;
	const raw = value as Record<string, unknown>;
	const id = stringValue(raw.id);
	const label = stringValue(raw.label) || id;
	const webhookUrl = stringValue(raw.webhookUrl);
	if (!id || !label) return null;

	const taskTypes = Array.isArray(raw.taskTypes)
		? raw.taskTypes.map((item) => stringValue(item)).filter(Boolean)
		: undefined;

	return {
		id,
		label,
		webhookUrl,
		webhookToken: stringValue(raw.webhookToken),
		workspaceId: stringValue(raw.workspaceId),
		agentId: stringValue(raw.agentId),
		taskTypes,
	};
}

function stringValue(value: unknown): string {
	return typeof value === "string" ? value.trim() : "";
}
