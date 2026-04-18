/**
 * Request middleware.
 *
 * Handles WordPress URL redirects, and engages Cloudflare's edge cache
 * for cacheable public content pages so repeat visits are served from
 * the POP rather than re-running SSR + D1.
 */
import { defineMiddleware } from "astro:middleware";
import { wpRedirects } from "./data/wp-redirects";

const CACHEABLE_PATHS: RegExp[] = [
	/^\/$/,
	/^\/posts(\/|$)/,
	/^\/pages(\/|$)/,
	/^\/guides(\/|$)/,
	/^\/category\//,
	/^\/tag\//,
	/^\/search$/,
	/^\/rss\.xml$/,
	// Single-segment root URLs (WP-style post/page permalinks).
	// Excludes admin (/_emdash), assets with extensions, and known prefixes.
	/^\/[^/._]+\/?$/,
];

const EDGE_CACHE_CONTROL = "public, s-maxage=300, stale-while-revalidate=86400";

function isCacheablePath(pathname: string): boolean {
	if (pathname.startsWith("/_emdash")) return false;
	if (pathname.startsWith("/api/")) return false;
	return CACHEABLE_PATHS.some((re) => re.test(pathname));
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

	const cacheable =
		request.method === "GET" &&
		isCacheablePath(pathname) &&
		!shouldSkipCache(request);

	if (!cacheable) {
		return next();
	}

	// caches.default is the Cloudflare Workers per-POP cache. The CacheStorage
	// shape here is extended by Cloudflare; TypeScript's lib.dom types don't
	// know about `.default`, hence the cast.
	const cache = (globalThis as unknown as { caches: { default: Cache } }).caches?.default;
	if (cache) {
		const hit = await cache.match(request);
		if (hit) return hit;
	}

	const response = await next();

	const contentType = response.headers.get("content-type") ?? "";
	const isHtml = contentType.includes("text/html") || contentType.includes("application/rss+xml") || contentType.includes("text/xml");

	if (response.status === 200 && isHtml) {
		const headers = new Headers(response.headers);
		// Only set if the route hasn't already picked a stronger policy.
		if (!headers.has("cache-control")) {
			headers.set("Cache-Control", EDGE_CACHE_CONTROL);
		}
		const cached = new Response(response.body, {
			status: response.status,
			statusText: response.statusText,
			headers,
		});

		if (cache) {
			type CfCtx = { waitUntil: (p: Promise<unknown>) => void };
			const cfCtx = (context.locals as { runtime?: { ctx?: CfCtx }; cfContext?: CfCtx })
				.runtime?.ctx ?? (context.locals as { cfContext?: CfCtx }).cfContext;
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
