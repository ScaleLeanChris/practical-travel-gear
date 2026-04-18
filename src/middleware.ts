/**
 * Request middleware.
 *
 * Handles WordPress URL redirects, and engages Cloudflare's edge cache
 * for cacheable public content pages so repeat visits are served from
 * the POP rather than re-running SSR + D1.
 */
import { defineMiddleware } from "astro:middleware";
import { wpRedirects } from "./data/wp-redirects";

// Individual content pages (posts, pages, guides, root-level slugs) rarely
// change post-publish. Give them a 1-hour freshness window.
const CONTENT_CACHE_CONTROL = "public, s-maxage=3600, stale-while-revalidate=86400";
// Listings (home, categories, tags, search, RSS) surface new entries and
// change more often. Keep them on a short 5-minute freshness window.
const LISTING_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=86400";

const LISTING_PATHS: RegExp[] = [
	/^\/$/,
	/^\/posts\/?$/,
	/^\/pages\/?$/,
	/^\/guides\/?$/,
	/^\/category\//,
	/^\/tag\//,
	/^\/search$/,
	/^\/rss\.xml$/,
];

const CONTENT_PATHS: RegExp[] = [
	/^\/posts\/[^/]+\/?$/,
	/^\/pages\/[^/]+\/?$/,
	/^\/guides\/[^/]+\/?$/,
	// Single-segment root URLs (WP-style post/page permalinks).
	// Excludes admin (/_emdash), assets with extensions, and listing roots.
	/^\/[^/._]+\/?$/,
];

function cacheControlFor(pathname: string): string | null {
	if (pathname.startsWith("/_emdash")) return null;
	if (pathname.startsWith("/api/")) return null;
	if (LISTING_PATHS.some((re) => re.test(pathname))) return LISTING_CACHE_CONTROL;
	if (CONTENT_PATHS.some((re) => re.test(pathname))) return CONTENT_CACHE_CONTROL;
	return null;
}

function shouldSkipCache(request: Request): boolean {
	// Logged-in editors or active preview sessions bypass the edge cache.
	const cookie = request.headers.get("cookie") ?? "";
	if (cookie.includes("emdash_session") || cookie.includes("emdash_preview")) {
		return true;
	}
	return false;
}

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;
	const { request } = context;

	const destination = wpRedirects[pathname];
	if (destination) {
		return context.redirect(destination, 301);
	}

	const routeCacheControl = request.method === "GET" ? cacheControlFor(pathname) : null;
	const cacheable = routeCacheControl !== null && !shouldSkipCache(request);

	if (!cacheable) {
		const r = await next();
		try { r.headers.set("X-Edge-Cache", "skip"); } catch { /* immutable */ }
		return r;
	}

	// caches.default is the Cloudflare Workers per-POP cache. The CacheStorage
	// shape here is extended by Cloudflare; TypeScript's lib.dom types don't
	// know about `.default`, hence the cast.
	const cache = (globalThis as unknown as { caches: { default: Cache } }).caches?.default;
	if (cache) {
		const hit = await cache.match(request);
		if (hit) {
			const h = new Response(hit.body, hit);
			h.headers.set("X-Edge-Cache", "hit");
			return h;
		}
	}

	const response = await next();

	const contentType = response.headers.get("content-type") ?? "";
	const isHtml = contentType.includes("text/html") || contentType.includes("application/rss+xml") || contentType.includes("text/xml");

	if (response.status === 200 && isHtml) {
		const headers = new Headers(response.headers);
		headers.set("X-Edge-Cache", "miss");
		// Only set if the route hasn't already picked a stronger policy.
		if (!headers.has("cache-control")) {
			headers.set("Cache-Control", routeCacheControl);
		}
		const cached = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});

		if (cache) {
			// Astro 6 removed `locals.runtime.ctx`; on Cloudflare the
			// ExecutionContext is exposed as `locals.cfContext`.
			type CfCtx = { waitUntil: (p: Promise<unknown>) => void };
			const cfCtx = (context.locals as { cfContext?: CfCtx }).cfContext;
			if (cfCtx?.waitUntil) {
				cfCtx.waitUntil(cache.put(request, cached.clone()));
			} else {
				// Fallback: await the put to avoid losing the write.
				await cache.put(request, cached.clone());
			}
		}

		return cached;
	}

	return response;
});
