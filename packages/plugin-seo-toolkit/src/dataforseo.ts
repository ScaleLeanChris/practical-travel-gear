import type { PluginContext } from "emdash";

interface DataForSEOCredentials {
	login: string;
	password: string;
}

async function getCredentials(ctx: PluginContext): Promise<DataForSEOCredentials | null> {
	const login = await ctx.kv.get<string>("settings:dataforseoLogin");
	const password = await ctx.kv.get<string>("settings:dataforseoPassword");
	if (!login || !password) return null;
	return { login, password };
}

function authHeader(creds: DataForSEOCredentials): string {
	return "Basic " + btoa(`${creds.login}:${creds.password}`);
}

async function apiCall(
	ctx: PluginContext,
	creds: DataForSEOCredentials,
	endpoint: string,
	body: unknown[],
): Promise<any> {
	const fetchFn = ctx.http!.fetch;
	const response = await fetchFn(`https://api.dataforseo.com/v3/${endpoint}`, {
		method: "POST",
		headers: {
			Authorization: authHeader(creds),
			"Content-Type": "application/json",
		},
		body: JSON.stringify(body),
	});

	if (!response.ok) {
		const text = await response.text();
		throw new Error(`DataForSEO ${response.status}: ${text}`);
	}

	return response.json();
}

export interface RankedKeyword {
	keyword: string;
	position: number;
	searchVolume: number;
	url: string;
	competition: number;
	cpc: number;
}

export interface BacklinkSummary {
	totalBacklinks: number;
	referringDomains: number;
	rank: number;
	dofollow: number;
	nofollow: number;
}

export interface ReferringDomain {
	domain: string;
	backlinks: number;
	rank: number;
	firstSeen: string;
}

export interface BrokenBacklink {
	sourceUrl: string;
	sourceDomain: string;
	targetUrl: string;
	anchor: string;
	redirectTarget: string | null;
}

export interface IndividualBacklink {
	urlFrom: string;
	domainFrom: string;
	urlTo: string;
	anchor: string;
	dofollow: boolean;
	isBroken: boolean;
	redirectUrl: string | null;
}

export async function fetchRankedKeywords(
	ctx: PluginContext,
	domain: string,
): Promise<RankedKeyword[]> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "dataforseo_labs/google/ranked_keywords/live", [
		{
			target: domain,
			location_name: "United States",
			language_name: "English",
			limit: 1000,
		},
	]);

	const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
	return items.map((item: any) => ({
		keyword: item.keyword_data?.keyword ?? "",
		position: item.ranked_serp_element?.serp_item?.rank_absolute ?? 0,
		searchVolume: item.keyword_data?.keyword_info?.search_volume ?? 0,
		url: item.ranked_serp_element?.serp_item?.relative_url ?? "",
		competition: item.keyword_data?.keyword_info?.competition ?? 0,
		cpc: item.keyword_data?.keyword_info?.cpc ?? 0,
	}));
}

export async function fetchBacklinkSummary(
	ctx: PluginContext,
	domain: string,
): Promise<BacklinkSummary> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "backlinks/summary/live", [
		{ target: domain, internal_list_limit: 0, external_list_limit: 0 },
	]);

	const result = data?.tasks?.[0]?.result?.[0] ?? {};
	return {
		totalBacklinks: result.backlinks ?? 0,
		referringDomains: result.referring_domains ?? 0,
		rank: result.rank ?? 0,
		dofollow: result.backlinks_nofollow !== undefined
			? (result.backlinks ?? 0) - (result.backlinks_nofollow ?? 0)
			: 0,
		nofollow: result.backlinks_nofollow ?? 0,
	};
}

export async function fetchReferringDomains(
	ctx: PluginContext,
	domain: string,
): Promise<ReferringDomain[]> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "backlinks/referring_domains/live", [
		{ target: domain, limit: 500, order_by: ["rank,desc"] },
	]);

	const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
	return items.map((item: any) => ({
		domain: item.domain ?? "",
		backlinks: item.backlinks ?? 0,
		rank: item.rank ?? 0,
		firstSeen: item.first_seen ?? "",
	}));
}

export async function fetchBrokenBacklinks(
	ctx: PluginContext,
	domain: string,
): Promise<BrokenBacklink[]> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "backlinks/backlinks/live", [
		{
			target: domain,
			limit: 500,
			mode: "one_per_domain",
			filters: ["is_broken", "=", true],
		},
	]);

	const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
	return items.map((item: any) => ({
		sourceUrl: item.url_from ?? "",
		sourceDomain: item.domain_from ?? "",
		targetUrl: item.url_to ?? "",
		anchor: item.anchor ?? "",
		redirectTarget: item.url_to_redirect_target ?? null,
	}));
}

export async function fetchIndividualBacklinks(
	ctx: PluginContext,
	domain: string,
): Promise<IndividualBacklink[]> {
	const creds = await getCredentials(ctx);
	if (!creds) throw new Error("DataForSEO credentials not configured");

	const data = await apiCall(ctx, creds, "backlinks/backlinks/live", [
		{
			target: domain,
			limit: 1000,
			order_by: ["rank,desc"],
		},
	]);

	const items = data?.tasks?.[0]?.result?.[0]?.items ?? [];
	return items.map((item: any) => ({
		urlFrom: item.url_from ?? "",
		domainFrom: item.domain_from ?? "",
		urlTo: item.url_to ?? "",
		anchor: item.anchor ?? "",
		dofollow: item.dofollow ?? false,
		isBroken: item.is_broken ?? false,
		redirectUrl: item.url_to_redirect_target ?? null,
	}));
}

export interface DomainDataCache {
	rankedKeywords?: { data: RankedKeyword[]; fetchedAt: string };
	backlinkSummary?: { data: BacklinkSummary; fetchedAt: string };
	referringDomains?: { data: ReferringDomain[]; fetchedAt: string };
	brokenBacklinks?: { data: BrokenBacklink[]; fetchedAt: string };
	individualBacklinks?: { data: IndividualBacklink[]; fetchedAt: string };
}

function isStale(fetchedAt: string | undefined, maxAgeMs: number): boolean {
	if (!fetchedAt) return true;
	return Date.now() - new Date(fetchedAt).getTime() > maxAgeMs;
}

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function refreshDomainData(
	ctx: PluginContext,
	domain: string,
): Promise<{ calls: number; errors: string[] }> {
	let calls = 0;
	const errors: string[] = [];
	const cached = await loadCachedDomainData(ctx);

	// Save previous backlink summary for trend comparison
	if (cached.backlinkSummary?.data) {
		await ctx.kv.set("prev_backlink_summary", cached.backlinkSummary.data);
	}

	if (isStale(cached.rankedKeywords?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchRankedKeywords(ctx, domain);
			await ctx.storage.domain_data.put("ranked_keywords", {
				dataType: "ranked_keywords",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
			// Write ranking history snapshots
			const today = new Date().toISOString().slice(0, 10);
			for (const kw of data) {
				await ctx.storage.ranking_history.put(`${kw.keyword}:${today}`, {
					keyword: kw.keyword,
					position: kw.position,
					searchVolume: kw.searchVolume,
					url: kw.url,
					competition: kw.competition,
					cpc: kw.cpc,
					fetchedAt: today,
				});
			}
			// Prune records older than 84 days
			const cutoff = new Date(Date.now() - 84 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
			try {
				const old: any = await ctx.storage.ranking_history.query({
					where: { fetchedAt: { lt: cutoff } },
					limit: 5000,
				});
				for (const item of old?.items ?? []) {
					await ctx.storage.ranking_history.delete(item.id ?? item.key);
				}
			} catch {
				// Prune is best-effort
			}
		} catch (err) {
			errors.push(`Ranked keywords: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	if (isStale(cached.backlinkSummary?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchBacklinkSummary(ctx, domain);
			await ctx.storage.domain_data.put("backlink_summary", {
				dataType: "backlink_summary",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
		} catch (err) {
			errors.push(`Backlink summary: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	if (isStale(cached.referringDomains?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchReferringDomains(ctx, domain);
			await ctx.storage.domain_data.put("referring_domains", {
				dataType: "referring_domains",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
		} catch (err) {
			errors.push(`Referring domains: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	if (isStale(cached.brokenBacklinks?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchBrokenBacklinks(ctx, domain);
			await ctx.storage.domain_data.put("broken_backlinks", {
				dataType: "broken_backlinks",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
		} catch (err) {
			errors.push(`Broken backlinks: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	if (isStale(cached.individualBacklinks?.fetchedAt, ONE_DAY_MS)) {
		try {
			const data = await fetchIndividualBacklinks(ctx, domain);
			await ctx.storage.domain_data.put("individual_backlinks", {
				dataType: "individual_backlinks",
				data,
				fetchedAt: new Date().toISOString(),
			});
			calls++;
		} catch (err) {
			errors.push(`Individual backlinks: ${err instanceof Error ? err.message : String(err)}`);
		}
	}

	return { calls, errors };
}

// Storage .get() may return the raw object or wrap it in { id, data }.
// Handle both shapes.
function unwrap(raw: any): any {
	if (!raw) return null;
	// If wrapped: { id: "...", data: { dataType, data, fetchedAt } }
	if (raw.data && typeof raw.data === "object" && "fetchedAt" in raw.data) return raw.data;
	// Raw: { dataType, data, fetchedAt }
	if ("fetchedAt" in raw) return raw;
	return raw;
}

export async function loadCachedDomainData(ctx: PluginContext): Promise<DomainDataCache> {
	const cache: DomainDataCache = {};

	try {
		const rk = unwrap(await ctx.storage.domain_data.get("ranked_keywords"));
		if (rk?.data) cache.rankedKeywords = { data: rk.data, fetchedAt: rk.fetchedAt };
	} catch {}

	try {
		const bs = unwrap(await ctx.storage.domain_data.get("backlink_summary"));
		if (bs?.data) cache.backlinkSummary = { data: bs.data, fetchedAt: bs.fetchedAt };
	} catch {}

	try {
		const rd = unwrap(await ctx.storage.domain_data.get("referring_domains"));
		if (rd?.data) cache.referringDomains = { data: rd.data, fetchedAt: rd.fetchedAt };
	} catch {}

	try {
		const bb = unwrap(await ctx.storage.domain_data.get("broken_backlinks"));
		if (bb?.data) cache.brokenBacklinks = { data: bb.data, fetchedAt: bb.fetchedAt };
	} catch {}

	try {
		const ib = unwrap(await ctx.storage.domain_data.get("individual_backlinks"));
		if (ib?.data) cache.individualBacklinks = { data: ib.data, fetchedAt: ib.fetchedAt };
	} catch {}

	return cache;
}

export interface RankingSnapshot {
	keyword: string;
	position: number;
	searchVolume: number;
	url: string;
	competition: number;
	cpc: number;
	fetchedAt: string;
}

export async function loadRankingHistory(
	ctx: PluginContext,
	keyword: string,
): Promise<RankingSnapshot[]> {
	try {
		const result: any = await ctx.storage.ranking_history.query({
			where: { keyword },
			limit: 100,
		});
		return (result?.items ?? []).map((item: any) => {
			const d = item?.data ?? item;
			return {
				keyword: d.keyword ?? keyword,
				position: d.position ?? 0,
				searchVolume: d.searchVolume ?? 0,
				url: d.url ?? "",
				competition: d.competition ?? 0,
				cpc: d.cpc ?? 0,
				fetchedAt: d.fetchedAt ?? "",
			} as RankingSnapshot;
		}).sort((a: RankingSnapshot, b: RankingSnapshot) => a.fetchedAt.localeCompare(b.fetchedAt));
	} catch {
		return [];
	}
}

export async function loadPreviousWeekRanking(
	ctx: PluginContext,
	keyword: string,
): Promise<RankingSnapshot | null> {
	const lastWeek = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
	try {
		const raw: any = await ctx.storage.ranking_history.get(`${keyword}:${lastWeek}`);
		const d = raw?.data ?? raw;
		if (!d?.position) return null;
		return {
			keyword: d.keyword ?? keyword,
			position: d.position,
			searchVolume: d.searchVolume ?? 0,
			url: d.url ?? "",
			competition: d.competition ?? 0,
			cpc: d.cpc ?? 0,
			fetchedAt: d.fetchedAt ?? lastWeek,
		};
	} catch {
		return null;
	}
}
