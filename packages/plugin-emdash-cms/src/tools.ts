/**
 * Tool definitions for Paperclip agents.
 * These are registered via ctx.tools in the plugin setup function,
 * giving agents the ability to interact with the EmDash CMS.
 */

import type { EmDashClient } from "./emdash-client.js";

export interface ToolDefinition {
	name: string;
	description: string;
	parameters: Record<string, ToolParam>;
	handler: (client: EmDashClient, params: Record<string, unknown>) => Promise<unknown>;
}

interface ToolParam {
	type: string;
	description: string;
	required?: boolean;
}

export const tools: ToolDefinition[] = [
	{
		name: "emdash.listContent",
		description:
			"List content entries from the EmDash CMS. Returns titles, slugs, status, and publish dates.",
		parameters: {
			collection: {
				type: "string",
				description: 'Collection name (e.g., "posts", "pages")',
				required: true,
			},
			limit: {
				type: "number",
				description: "Max entries to return (default: 50)",
			},
		},
		handler: async (client, params) => {
			const result = await client.listContent(
				params.collection as string,
				params.limit as number | undefined,
			);
			return result;
		},
	},
	{
		name: "emdash.getContent",
		description:
			"Get a specific content entry from the EmDash CMS by collection and slug.",
		parameters: {
			collection: {
				type: "string",
				description: 'Collection name (e.g., "posts", "pages")',
				required: true,
			},
			slug: {
				type: "string",
				description: "Entry slug or ID",
				required: true,
			},
		},
		handler: async (client, params) => {
			const result = await client.getContent(
				params.collection as string,
				params.slug as string,
			);
			return result;
		},
	},
	{
		name: "emdash.getSeoScore",
		description:
			"Get the SEO content analysis score for a specific entry. Includes readability grade, keyword usage, heading structure, and link analysis.",
		parameters: {
			entryId: {
				type: "string",
				description: "Entry ID (slug) to check",
				required: true,
			},
		},
		handler: async (client, params) => {
			const result = await client.getSeoScore(params.entryId as string);
			return result;
		},
	},
	{
		name: "emdash.getSeoAudit",
		description:
			"Get the SEO audit result for a specific entry. Includes issue list with severity levels (missing descriptions, thin content, duplicate titles, etc.).",
		parameters: {
			entryId: {
				type: "string",
				description: "Entry ID (slug) to audit",
				required: true,
			},
		},
		handler: async (client, params) => {
			const result = await client.getAuditResult(
				params.entryId as string,
			);
			return result;
		},
	},
	{
		name: "emdash.getSiteSeoSummary",
		description:
			"Get an aggregate SEO health summary for the entire site. Includes average scores, total issues, issue breakdown by type, and the worst-performing entries.",
		parameters: {},
		handler: async (client) => {
			const result = await client.getSeoSummary();
			return result;
		},
	},
	{
		name: "emdash.getKeywords",
		description:
			"Get ranked keywords from the DataForSEO cache. Returns keyword, SERP position, search volume, mapped URL, competition, and CPC.",
		parameters: {},
		handler: async (client) => {
			const result = await client.getKeywords();
			return result;
		},
	},
	{
		name: "emdash.getBacklinks",
		description:
			"Get backlink data including summary stats (total backlinks, referring domains, domain rank), top referring domains, and broken inbound links.",
		parameters: {},
		handler: async (client) => {
			const result = await client.getBacklinks();
			return result;
		},
	},
];
