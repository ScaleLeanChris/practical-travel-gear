import type { PluginContext } from "emdash";

export interface AuditIssue {
	check: string;
	severity: "error" | "warning" | "info";
	detail: string;
}

export interface AuditResult {
	entryId: string;
	collection: string;
	slug: string;
	title: string;
	score: number;
	issues: AuditIssue[];
	lastAudit: string;
}

const WEIGHTS: Record<string, number> = {
	error: 20,
	warning: 10,
	info: 5,
};

function countWords(text: string): number {
	return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function extractTextFromPortableText(blocks: any[]): string {
	if (!Array.isArray(blocks)) return "";
	const parts: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && Array.isArray(block.children)) {
			for (const child of block.children) {
				if (typeof child.text === "string") parts.push(child.text);
			}
		}
	}
	return parts.join(" ");
}

function findImagesWithoutAlt(blocks: any[]): number {
	if (!Array.isArray(blocks)) return 0;
	let missing = 0;
	for (const block of blocks) {
		if (block._type === "image" && (!block.alt || block.alt.trim() === "")) {
			missing++;
		}
	}
	return missing;
}

function auditEntry(
	entry: any,
	seo: any,
	allTitles: Map<string, string>,
): AuditIssue[] {
	const issues: AuditIssue[] = [];
	const body = entry.data?.body ?? [];
	const bodyText = extractTextFromPortableText(body);
	const wordCount = countWords(bodyText);

	const resolvedTitle: string =
		seo?.title || entry.data?.title || entry.id || "";

	// Missing meta description
	const description = seo?.description || entry.data?.excerpt || "";
	if (!description || description.trim() === "") {
		issues.push({
			check: "missing_description",
			severity: "warning",
			detail: "No meta description or excerpt",
		});
	}

	// Short title
	if (resolvedTitle.length > 0 && resolvedTitle.length < 30) {
		issues.push({
			check: "short_title",
			severity: "warning",
			detail: `Title is ${resolvedTitle.length} chars (target: 30-60)`,
		});
	}

	// Long title
	if (resolvedTitle.length > 60) {
		issues.push({
			check: "long_title",
			severity: "warning",
			detail: `Title is ${resolvedTitle.length} chars (target: 30-60)`,
		});
	}

	// Missing featured image
	if (!seo?.image && !entry.data?.image) {
		issues.push({
			check: "missing_image",
			severity: "info",
			detail: "No featured/OG image",
		});
	}

	// Missing alt text
	const missingAlt = findImagesWithoutAlt(body);
	if (missingAlt > 0) {
		issues.push({
			check: "missing_alt_text",
			severity: "warning",
			detail: `${missingAlt} image${missingAlt > 1 ? "s" : ""} missing alt text`,
		});
	}

	// Thin content
	if (wordCount < 300) {
		issues.push({
			check: "thin_content",
			severity: "warning",
			detail: `Word count: ${wordCount} (target: 300+)`,
		});
	}

	// Duplicate titles
	const titleKey = resolvedTitle.toLowerCase().trim();
	const existing = allTitles.get(titleKey);
	if (existing && existing !== entry.id) {
		issues.push({
			check: "duplicate_title",
			severity: "error",
			detail: `Same title as entry "${existing}"`,
		});
	}

	// Noindex flagged
	if (seo?.noIndex) {
		issues.push({
			check: "noindex",
			severity: "info",
			detail: "Page is marked noindex",
		});
	}

	// Missing canonical
	if (!seo?.canonical) {
		issues.push({
			check: "missing_canonical",
			severity: "info",
			detail: "No explicit canonical URL",
		});
	}

	return issues;
}

function calculateScore(issues: AuditIssue[]): number {
	let score = 100;
	for (const issue of issues) {
		score -= WEIGHTS[issue.severity] ?? 0;
	}
	return Math.max(0, score);
}

export async function runAudit(ctx: PluginContext): Promise<AuditResult[]> {
	const results: AuditResult[] = [];
	const allTitles = new Map<string, string>();
	const collections = ["posts", "pages"];
	const allEntries: Array<{ entry: any; collection: string; seo: any }> = [];

	for (const collection of collections) {
		try {
			const result: any = await ctx.content!.list(collection, {
				where: { status: "published" },
				limit: 1000,
			});
			const items = result?.items ?? [];
			for (const entry of items) {
				const seo = (entry as any).seo ?? null;
				const title = (seo?.title || (entry as any).data?.title || "").toLowerCase().trim();
				if (title) {
					const prev = allTitles.get(title);
					if (!prev) allTitles.set(title, entry.id);
				}
				allEntries.push({ entry, collection, seo });
			}
		} catch (err) {
			ctx.log.warn(`Audit: failed to list ${collection}`, err);
		}
	}

	for (const { entry, collection, seo } of allEntries) {
		const issues = auditEntry(entry, seo, allTitles);
		const score = calculateScore(issues);
		const result: AuditResult = {
			entryId: entry.id,
			collection,
			slug: entry.slug ?? entry.id,
			title: entry.data?.title ?? entry.id,
			score,
			issues,
			lastAudit: new Date().toISOString(),
		};
		results.push(result);
		await ctx.storage.audit_results.put(entry.id, result);
	}

	return results;
}
