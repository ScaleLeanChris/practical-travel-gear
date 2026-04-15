import type { PluginContext } from "emdash";
import {
	getSeoScore,
	getSeoScores,
	getAuditResult,
	getAuditResults,
	getSiteHealth,
	getKeywords,
	getBacklinks,
} from "./seo-bridge.js";

interface ApiRequest {
	action: string;
	secret: string;
	params?: Record<string, unknown>;
}

interface ApiResponse {
	ok: boolean;
	data?: unknown;
	error?: string;
}

async function validateSecret(
	ctx: PluginContext,
	secret: string,
): Promise<boolean> {
	const expected = await ctx.kv.get<string>("settings:inboundSecret");
	if (!expected) return false;
	return secret === expected;
}

async function handleAction(
	ctx: PluginContext,
	action: string,
	params: Record<string, unknown>,
): Promise<ApiResponse> {
	switch (action) {
		case "get_seo_score": {
			const entryId = params.entryId as string;
			if (!entryId) return { ok: false, error: "entryId required" };
			const score = await getSeoScore(ctx, entryId);
			return score
				? { ok: true, data: score }
				: { ok: false, error: "No score found for entry" };
		}

		case "get_seo_scores": {
			const collection = params.collection as string | undefined;
			const scores = await getSeoScores(ctx, collection);
			return { ok: true, data: scores };
		}

		case "get_audit_result": {
			const entryId = params.entryId as string;
			if (!entryId) return { ok: false, error: "entryId required" };
			const result = await getAuditResult(ctx, entryId);
			return result
				? { ok: true, data: result }
				: { ok: false, error: "No audit result found" };
		}

		case "get_audit_results": {
			const collection = params.collection as string | undefined;
			const results = await getAuditResults(ctx, collection);
			return { ok: true, data: results };
		}

		case "get_seo_summary": {
			const health = await getSiteHealth(ctx);
			return { ok: true, data: health };
		}

		case "get_keywords": {
			const keywords = await getKeywords(ctx);
			return keywords
				? { ok: true, data: keywords }
				: { ok: false, error: "No keyword data cached" };
		}

		case "get_backlinks": {
			const backlinks = await getBacklinks(ctx);
			return { ok: true, data: backlinks };
		}

		case "get_content": {
			const collection = params.collection as string;
			const slug = params.slug as string;
			if (!collection || !slug)
				return { ok: false, error: "collection and slug required" };
			try {
				const { items } = await ctx.content!.list(collection, {
					limit: 1,
				} as any);
				const entry = items.find(
					(e: any) => e.id === slug || e.slug === slug,
				);
				if (!entry) return { ok: false, error: "Entry not found" };
				return {
					ok: true,
					data: {
						id: entry.id,
						slug: (entry as any).slug ?? entry.id,
						title: (entry as any).data?.title,
						status: (entry as any).data?.status,
						publishedAt: (entry as any).data?.published_at,
						seo: (entry as any).seo ?? null,
					},
				};
			} catch (err) {
				return {
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}

		case "list_content": {
			const collection = params.collection as string;
			if (!collection) return { ok: false, error: "collection required" };
			const limit = (params.limit as number) ?? 50;
			try {
				const { items } = await ctx.content!.list(collection, {
					limit,
					orderBy: { published_at: "desc" },
				} as any);
				const entries = items.map((e: any) => ({
					id: e.id,
					slug: e.slug ?? e.id,
					title: e.data?.title,
					status: e.data?.status,
					publishedAt: e.data?.published_at,
				}));
				return { ok: true, data: entries };
			} catch (err) {
				return {
					ok: false,
					error: err instanceof Error ? err.message : String(err),
				};
			}
		}

		default:
			return { ok: false, error: `Unknown action: ${action}` };
	}
}

export async function handleInboundApi(
	routeCtx: any,
	ctx: PluginContext,
): Promise<ApiResponse> {
	const request = routeCtx.input as ApiRequest;

	if (!request.secret) {
		return { ok: false, error: "Authentication required" };
	}

	const valid = await validateSecret(ctx, request.secret);
	if (!valid) {
		return { ok: false, error: "Invalid secret" };
	}

	if (!request.action) {
		return { ok: false, error: "action required" };
	}

	// Log inbound request
	try {
		const logId = `inbound-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
		await ctx.storage.event_log.put(logId, {
			eventType: `api:${request.action}`,
			direction: "inbound",
			timestamp: new Date().toISOString(),
			sent: true,
		});
	} catch {
		// Non-critical, don't fail the request
	}

	return handleAction(ctx, request.action, request.params ?? {});
}
