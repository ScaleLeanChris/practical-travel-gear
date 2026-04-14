import type { PluginContext } from "emdash";

export interface AnalysisCheck {
	pass: boolean;
	value?: number | string;
	detail?: string;
}

export interface AnalysisResult {
	entryId: string;
	collection: string;
	score: number;
	readabilityGrade: number;
	checks: Record<string, AnalysisCheck>;
	lastAnalysis: string;
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

function extractParagraphs(blocks: any[]): string[] {
	if (!Array.isArray(blocks)) return [];
	const paragraphs: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && block.style === "normal" && Array.isArray(block.children)) {
			const text = block.children
				.filter((c: any) => typeof c.text === "string")
				.map((c: any) => c.text)
				.join("");
			if (text.trim()) paragraphs.push(text);
		}
	}
	return paragraphs;
}

function extractHeadings(blocks: any[]): string[] {
	if (!Array.isArray(blocks)) return [];
	const headings: string[] = [];
	for (const block of blocks) {
		if (block._type === "block" && typeof block.style === "string" && block.style.startsWith("h")) {
			headings.push(block.style);
		}
	}
	return headings;
}

function countSentences(text: string): number {
	return text.split(/[.!?]+/).filter((s) => s.trim().length > 0).length;
}

function countWords(text: string): number {
	return text.split(/\s+/).filter((w) => w.length > 0).length;
}

function countSyllables(word: string): number {
	const w = word.toLowerCase().replace(/[^a-z]/g, "");
	if (w.length <= 3) return 1;
	let count = 0;
	const vowels = "aeiouy";
	let prevVowel = false;
	for (const ch of w) {
		const isVowel = vowels.includes(ch);
		if (isVowel && !prevVowel) count++;
		prevVowel = isVowel;
	}
	if (w.endsWith("e") && count > 1) count--;
	return Math.max(1, count);
}

function fleschKincaidGrade(text: string): number {
	const words = countWords(text);
	const sentences = countSentences(text);
	const syllables = text
		.split(/\s+/)
		.filter((w) => w.length > 0)
		.reduce((sum, w) => sum + countSyllables(w), 0);

	if (words === 0 || sentences === 0) return 0;

	return 0.39 * (words / sentences) + 11.8 * (syllables / words) - 15.59;
}

function findLinksInBlocks(blocks: any[], internal: boolean): number {
	if (!Array.isArray(blocks)) return 0;
	let count = 0;
	for (const block of blocks) {
		if (block._type === "block" && Array.isArray(block.markDefs)) {
			for (const mark of block.markDefs) {
				if (mark._type === "link" && typeof mark.href === "string") {
					const isInternal =
						mark.href.startsWith("/") || mark.href.includes("practicaltravelgear.com");
					if (internal === isInternal) count++;
				}
			}
		}
	}
	return count;
}

export async function analyzeContent(
	ctx: PluginContext,
	entry: any,
	collection: string,
): Promise<AnalysisResult> {
	const body = entry.data?.body ?? [];
	const bodyText = extractTextFromPortableText(body);
	const title: string = entry.data?.title ?? "";
	const checks: Record<string, AnalysisCheck> = {};

	// Readability
	const grade = fleschKincaidGrade(bodyText);
	checks.readability = {
		pass: grade >= 4 && grade <= 10,
		value: Math.round(grade * 10) / 10,
		detail: grade > 10 ? "Content may be too complex for web readers" : undefined,
	};

	// Sentence length
	const words = countWords(bodyText);
	const sentences = countSentences(bodyText);
	const avgSentenceLen = sentences > 0 ? Math.round(words / sentences) : 0;
	checks.sentence_length = {
		pass: avgSentenceLen <= 25,
		value: avgSentenceLen,
		detail: avgSentenceLen > 25 ? `Average ${avgSentenceLen} words/sentence (target: <25)` : undefined,
	};

	// Paragraph length
	const paragraphs = extractParagraphs(body);
	const longParagraphs = paragraphs.filter((p) => countWords(p) > 150).length;
	checks.paragraph_length = {
		pass: longParagraphs === 0,
		value: longParagraphs,
		detail: longParagraphs > 0 ? `${longParagraphs} paragraph(s) over 150 words` : undefined,
	};

	// Heading structure
	const headings = extractHeadings(body);
	const hasH2 = headings.includes("h2");
	const levels = headings.map((h) => parseInt(h.replace("h", ""), 10)).sort();
	let skippedLevel = false;
	for (let i = 1; i < levels.length; i++) {
		if (levels[i] - levels[i - 1] > 1) {
			skippedLevel = true;
			break;
		}
	}
	checks.heading_structure = {
		pass: hasH2 && !skippedLevel,
		detail: !hasH2
			? "No H2 heading found"
			: skippedLevel
				? "Skipped heading level (e.g., H1 to H3)"
				: undefined,
	};

	// Internal links
	const internalLinks = findLinksInBlocks(body, true);
	checks.internal_links = {
		pass: internalLinks > 0,
		value: internalLinks,
		detail: internalLinks === 0 ? "No internal links found" : undefined,
	};

	// External links
	const externalLinks = findLinksInBlocks(body, false);
	checks.external_links = {
		pass: externalLinks > 0,
		value: externalLinks,
		detail: externalLinks === 0 ? "No external links found" : undefined,
	};

	// Keyword checks — only if DataForSEO cache has data for this URL
	try {
		const cached: any = await ctx.storage.domain_data.get("ranked_keywords");
		if (cached?.data) {
			const slug = entry.slug ?? entry.id;
			const entryKeywords = (cached.data as any[]).filter(
				(kw: any) => kw.url && (kw.url.includes(`/${slug}`) || kw.url.endsWith(`/${slug}`)),
			);
			if (entryKeywords.length > 0) {
				const primary = entryKeywords.sort((a: any, b: any) => b.searchVolume - a.searchVolume)[0];
				const keyword = primary.keyword.toLowerCase();

				checks.keyword_in_title = {
					pass: title.toLowerCase().includes(keyword),
					value: primary.keyword,
					detail: !title.toLowerCase().includes(keyword)
						? `Primary keyword "${primary.keyword}" not in title`
						: undefined,
				};

				const first100Words = bodyText.split(/\s+/).slice(0, 100).join(" ").toLowerCase();
				checks.keyword_in_first_paragraph = {
					pass: first100Words.includes(keyword),
					value: primary.keyword,
					detail: !first100Words.includes(keyword)
						? `Primary keyword not in first 100 words`
						: undefined,
				};

				const bodyLower = bodyText.toLowerCase();
				const keywordCount = bodyLower.split(keyword).length - 1;
				const totalWords = countWords(bodyText);
				const density = totalWords > 0 ? (keywordCount / totalWords) * 100 : 0;
				const roundedDensity = Math.round(density * 100) / 100;
				checks.keyword_density = {
					pass: density >= 0.5 && density <= 3,
					value: `${roundedDensity}%`,
					detail:
						density < 0.5
							? `Keyword density ${roundedDensity}% is low (target: 0.5-3%)`
							: density > 3
								? `Keyword density ${roundedDensity}% is high (target: 0.5-3%)`
								: undefined,
				};
			}
		}
	} catch {
		// No keyword data available — skip keyword checks silently
	}

	const checkValues = Object.values(checks);
	const totalChecks = checkValues.length;
	const passedChecks = checkValues.filter((c) => c.pass).length;
	const score = totalChecks > 0 ? Math.round((passedChecks / totalChecks) * 100) : 100;

	const result: AnalysisResult = {
		entryId: entry.id,
		collection,
		score,
		readabilityGrade: Math.round(grade * 10) / 10,
		checks,
		lastAnalysis: new Date().toISOString(),
	};

	await ctx.storage.analysis_scores.put(entry.id, result);
	return result;
}
