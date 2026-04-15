import type { PluginContext } from "emdash";

export async function buildActivityPage(ctx: PluginContext) {
	let events: any[] = [];
	try {
		const { items } = await ctx.storage.event_log.query({
			orderBy: { timestamp: "desc" },
			limit: 100,
		});
		events = items;
	} catch {
		// Storage may be empty
	}

	const blocks: any[] = [
		{ type: "header", text: "Activity Log" },
		{
			type: "context",
			text: "Events sent to and received from Paperclip.",
		},
		{ type: "divider" },
	];

	if (events.length === 0) {
		blocks.push({
			type: "context",
			text: "No activity recorded yet.",
		});
	} else {
		// Summary stats
		const sent = events.filter((e: any) => e.sent).length;
		const failed = events.length - sent;
		blocks.push({
			type: "stats",
			stats: [
				{ label: "Total Events", value: String(events.length) },
				{ label: "Sent", value: String(sent) },
				{ label: "Failed", value: String(failed), color: failed > 0 ? "red" : "green" },
			],
		});
		blocks.push({ type: "divider" });

		blocks.push({
			type: "table",
			columns: [
				{ key: "eventType", label: "Event" },
				{ key: "direction", label: "Direction" },
				{ key: "collection", label: "Collection" },
				{ key: "title", label: "Entry" },
				{ key: "status", label: "Status" },
				{ key: "error", label: "Error" },
				{ key: "timestamp", label: "Time" },
			],
			rows: events.map((e: any) => ({
				eventType: e.eventType ?? "—",
				direction: e.direction ?? "outbound",
				collection: e.collection ?? "—",
				title: e.title ?? e.entryId ?? "—",
				status: e.sent ? "OK" : "Failed",
				error: e.error ?? "—",
				timestamp: e.timestamp
					? new Date(e.timestamp).toLocaleString()
					: "—",
			})),
		});
	}

	return { blocks };
}
