import type { PluginContext } from "emdash";
import { getSiteHealth } from "./seo-bridge.js";

function trafficLight(score: number): string {
	if (score >= 90) return "green";
	if (score >= 70) return "yellow";
	return "red";
}

export async function buildDashboardPage(ctx: PluginContext) {
	const apiBase = await ctx.kv.get<string>("settings:apiBase");
	const apiKey = await ctx.kv.get<string>("settings:apiKey");
	const connected = !!(apiBase && apiKey);

	// Fetch recent activity from event log
	let recentEvents: any[] = [];
	try {
		const { items } = await ctx.storage.event_log.query({
			orderBy: { timestamp: "desc" },
			limit: 20,
		});
		recentEvents = items;
	} catch {
		// Storage may be empty on first load
	}

	// Fetch active tasks
	let activeTasks: any[] = [];
	try {
		const { items } = await ctx.storage.tasks.query({
			where: { status: "active" },
			limit: 10,
		});
		activeTasks = items;
	} catch {
		// Storage may be empty
	}

	// Get SEO health summary
	let health: Awaited<ReturnType<typeof getSiteHealth>> | null = null;
	try {
		health = await getSiteHealth(ctx);
	} catch {
		// SEO plugin may not have run yet
	}

	const blocks: any[] = [
		{ type: "header", text: "Paperclip Dashboard" },
		{
			type: "context",
			text: connected
				? `Connected to ${apiBase}`
				: "Not connected — configure in Settings",
		},
		{ type: "divider" },
	];

	// Site health stats (from SEO bridge)
	if (health && health.totalEntries > 0) {
		blocks.push({
			type: "stats",
			stats: [
				{
					label: "Audit Score",
					value: `${health.averageAuditScore}/100`,
					color: trafficLight(health.averageAuditScore),
				},
				{
					label: "Content Score",
					value: `${health.averageAnalysisScore}/100`,
					color: trafficLight(health.averageAnalysisScore),
				},
				{
					label: "Entries",
					value: String(health.totalEntries),
				},
				{
					label: "SEO Issues",
					value: String(health.totalIssues),
					color: health.totalIssues > 10 ? "red" : "green",
				},
			],
		});
		blocks.push({ type: "divider" });
	}

	// Active tasks from Paperclip
	if (activeTasks.length > 0) {
		blocks.push({ type: "section", text: "**Active Agent Tasks**" });
		blocks.push({
			type: "table",
			columns: [
				{ key: "title", label: "Task" },
				{ key: "agentId", label: "Agent" },
				{ key: "status", label: "Status" },
				{ key: "updatedAt", label: "Updated" },
			],
			rows: activeTasks.map((t: any) => ({
				title: t.title ?? "Untitled",
				agentId: t.agentId ?? "—",
				status: t.status ?? "—",
				updatedAt: t.updatedAt
					? new Date(t.updatedAt).toLocaleDateString()
					: "—",
			})),
		});
		blocks.push({ type: "divider" });
	}

	// Recent activity log
	blocks.push({ type: "section", text: "**Recent Activity**" });
	if (recentEvents.length === 0) {
		blocks.push({
			type: "context",
			text: "No events yet. Events will appear here once content is saved and synced to Paperclip.",
		});
	} else {
		blocks.push({
			type: "table",
			columns: [
				{ key: "eventType", label: "Event" },
				{ key: "collection", label: "Collection" },
				{ key: "title", label: "Entry" },
				{ key: "status", label: "Status" },
				{ key: "timestamp", label: "Time" },
			],
			rows: recentEvents.map((e: any) => ({
				eventType: e.eventType ?? "—",
				collection: e.collection ?? "—",
				title: e.title ?? e.entryId ?? "—",
				status: e.sent ? "Sent" : "Failed",
				timestamp: e.timestamp
					? new Date(e.timestamp).toLocaleString()
					: "—",
			})),
		});
	}

	return { blocks };
}
