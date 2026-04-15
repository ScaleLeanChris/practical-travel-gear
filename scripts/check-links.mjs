/**
 * Interior broken link checker.
 *
 * Crawls the local dev server starting from known entry points,
 * discovers all internal links, and reports broken ones.
 *
 * Prerequisites: dev server running at http://localhost:4321
 *
 * Usage:
 *   node scripts/check-links.mjs                    # crawl from seed URLs
 *   node scripts/check-links.mjs --include-images   # also check <img src> tags
 */

import { JSDOM } from "jsdom";

const BASE = "http://localhost:4321";
const CONCURRENCY = 5;
const INCLUDE_IMAGES = process.argv.includes("--include-images");

// ── State ────────────────────────────────────────────────────────────────────

/** @type {Map<string, {status: number, redirectTo?: string}>} */
const results = new Map();

/** @type {Map<string, Set<string>>} source URL → set of pages that link to it */
const linkedFrom = new Map();

/** @type {Set<string>} */
const queued = new Set();

/** @type {string[]} */
const queue = [];

// ── Helpers ──────────────────────────────────────────────────────────────────

function normalizeUrl(href, pageUrl) {
	try {
		const url = new URL(href, pageUrl);
		// Only internal links
		if (url.origin !== BASE) return null;
		// Strip hash
		url.hash = "";
		// Strip trailing slash except for root
		let path = url.pathname;
		if (path !== "/" && path.endsWith("/")) {
			path = path.slice(0, -1);
		}
		url.pathname = path;
		return url.href;
	} catch {
		return null;
	}
}

function isSkippable(href) {
	if (!href) return true;
	if (href.startsWith("mailto:") || href.startsWith("tel:") || href.startsWith("javascript:")) return true;
	if (href === "#" || href.startsWith("#")) return true;
	return false;
}

function enqueue(url, fromPage) {
	if (!queued.has(url)) {
		queued.add(url);
		queue.push(url);
	}
	if (fromPage) {
		if (!linkedFrom.has(url)) linkedFrom.set(url, new Set());
		linkedFrom.get(url).add(fromPage);
	}
}

async function fetchPage(url) {
	try {
		const res = await fetch(url, { redirect: "manual" });
		const status = res.status;
		let redirectTo;

		if (status >= 300 && status < 400) {
			redirectTo = res.headers.get("location");
		}

		results.set(url, { status, redirectTo });

		// Only parse HTML pages for more links
		const contentType = res.headers.get("content-type") || "";
		if (status === 200 && contentType.includes("text/html")) {
			const html = await res.text();
			return html;
		}
	} catch (err) {
		results.set(url, { status: 0 });
	}
	return null;
}

function extractLinks(html, pageUrl) {
	const dom = new JSDOM(html);
	const doc = dom.window.document;

	// <a href="...">
	for (const a of doc.querySelectorAll("a[href]")) {
		const href = a.getAttribute("href");
		if (isSkippable(href)) continue;
		const normalized = normalizeUrl(href, pageUrl);
		if (normalized) {
			// Skip admin, API, and asset URLs
			const path = new URL(normalized).pathname;
			if (path.startsWith("/_emdash")) continue;
			if (path.startsWith("/_astro")) continue;
			enqueue(normalized, pageUrl);
		}
	}

	// Optionally check <img src="...">
	if (INCLUDE_IMAGES) {
		for (const img of doc.querySelectorAll("img[src]")) {
			const src = img.getAttribute("src");
			if (isSkippable(src)) continue;
			const normalized = normalizeUrl(src, pageUrl);
			if (normalized) {
				enqueue(normalized, pageUrl);
			}
		}
	}
}

// ── Seed URLs ────────────────────────────────────────────────────────────────

function seedQueue() {
	const seeds = [
		`${BASE}/`,
		`${BASE}/posts`,
		`${BASE}/guides`,
		`${BASE}/search`,
		`${BASE}/rss.xml`,
	];
	for (const url of seeds) {
		enqueue(url, null);
	}
}

// ── Crawl Engine ─────────────────────────────────────────────────────────────

async function crawl() {
	let idx = 0;
	let active = 0;
	let total = 0;

	return new Promise((resolve) => {
		function next() {
			while (active < CONCURRENCY && idx < queue.length) {
				const url = queue[idx++];
				active++;
				total++;

				if (total % 50 === 0) {
					process.stdout.write(`\r  Checked ${total} URLs, ${queue.length - idx} remaining...`);
				}

				fetchPage(url)
					.then((html) => {
						if (html) extractLinks(html, url);
					})
					.finally(() => {
						active--;
						next();
					});
			}

			if (active === 0 && idx >= queue.length) {
				resolve();
			}
		}

		next();
	});
}

// ── Report ───────────────────────────────────────────────────────────────────

function report() {
	const broken = [];
	const redirects = [];
	const ok = [];

	for (const [url, { status, redirectTo }] of results) {
		const path = url.replace(BASE, "") || "/";
		const sources = linkedFrom.get(url);
		const from = sources ? [...sources].map((s) => s.replace(BASE, "") || "/") : [];

		if (status === 0 || status >= 400) {
			broken.push({ path, status, from });
		} else if (status >= 300 && status < 400) {
			redirects.push({ path, status, redirectTo, from });
		} else {
			ok.push({ path, status });
		}
	}

	console.log("\n");
	console.log("═══════════════════════════════════════════════════════════════");
	console.log("  LINK CHECK RESULTS");
	console.log("═══════════════════════════════════════════════════════════════");
	console.log(`  Total URLs checked: ${results.size}`);
	console.log(`  ✓ OK (2xx): ${ok.length}`);
	console.log(`  → Redirects (3xx): ${redirects.length}`);
	console.log(`  ✗ Broken (4xx/5xx/0): ${broken.length}`);
	console.log("═══════════════════════════════════════════════════════════════\n");

	if (broken.length > 0) {
		console.log("── BROKEN LINKS ────────────────────────────────────────────────\n");
		for (const { path, status, from } of broken.sort((a, b) => a.path.localeCompare(b.path))) {
			console.log(`  ${status} ${path}`);
			if (from.length > 0) {
				for (const f of from.slice(0, 5)) {
					console.log(`      ← linked from: ${f}`);
				}
				if (from.length > 5) {
					console.log(`      ← ... and ${from.length - 5} more`);
				}
			}
		}
		console.log();
	}

	if (redirects.length > 0) {
		console.log("── REDIRECTS ───────────────────────────────────────────────────\n");
		for (const { path, status, redirectTo, from } of redirects.sort((a, b) => a.path.localeCompare(b.path))) {
			console.log(`  ${status} ${path} → ${redirectTo}`);
			if (from.length > 0) {
				for (const f of from.slice(0, 3)) {
					console.log(`      ← linked from: ${f}`);
				}
				if (from.length > 3) {
					console.log(`      ← ... and ${from.length - 3} more`);
				}
			}
		}
		console.log();
	}

	return broken.length;
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
	// Check dev server is running
	try {
		await fetch(BASE, { signal: AbortSignal.timeout(3000) });
	} catch {
		console.error("Error: Dev server not running at " + BASE);
		console.error("Start it first: npx emdash dev");
		process.exit(1);
	}

	console.log("Starting interior link check...");
	console.log(`  Base: ${BASE}`);
	console.log(`  Images: ${INCLUDE_IMAGES ? "yes" : "no (use --include-images)"}`);
	console.log();

	seedQueue();

	// First, crawl seed pages to discover all content links
	console.log("  Phase 1: Crawling from seed URLs...");
	await crawl();

	console.log(`\r  Phase 1 complete: discovered ${queue.length} URLs from seed pages`);
	console.log("  Phase 2: Checking all discovered links...");
	await crawl(); // Process any newly discovered URLs

	const brokenCount = report();
	process.exit(brokenCount > 0 ? 1 : 0);
}

main();
