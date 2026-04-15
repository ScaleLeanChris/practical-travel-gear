import type { PluginContext } from "emdash";

export async function buildActivityPage(ctx: PluginContext) {
	let tasks: any[] = [];
	try {
		const { items } = await ctx.storage.task_log.query({
			orderBy: { timestamp: "desc" },
			limit: 100,
		});
		tasks = items;
	} catch {
		// Storage may be empty on first load.
	}

	const blocks: any[] = [
		{ type: "header", text: "Hyperagent Activity" },
		{
			type: "context",
			text: "Task webhook attempts sent from EmDash to Hyperagent.",
		},
		{ type: "divider" },
	];

	if (tasks.length === 0) {
		blocks.push({
			type: "context",
			text: "No tasks sent yet.",
		});
		return { blocks };
	}

	const sent = tasks.filter((task: any) => task.status === "sent").length;
	const failed = tasks.length - sent;

	blocks.push({
		type: "stats",
		stats: [
			{ label: "Total Tasks", value: String(tasks.length) },
			{ label: "Sent", value: String(sent) },
			{ label: "Failed", value: String(failed), color: failed > 0 ? "red" : "green" },
		],
	});
	blocks.push({ type: "divider" });
	blocks.push({
		type: "table",
		columns: [
			{ key: "title", label: "Task" },
			{ key: "destination", label: "Destination" },
			{ key: "taskType", label: "Type" },
			{ key: "source", label: "Source" },
			{ key: "priority", label: "Priority" },
			{ key: "status", label: "Status" },
			{ key: "error", label: "Error" },
			{ key: "timestamp", label: "Time", format: "relative_time" },
		],
		rows: tasks.map((task: any) => ({
			title: task.title ?? "Untitled",
			destination: task.destinationLabel ?? task.destinationId ?? "—",
			taskType: task.taskType ?? "general",
			source: task.source ?? "—",
			priority: task.priority ?? "normal",
			status: task.status === "sent" ? "Sent" : "Failed",
			error: task.error ?? "—",
			timestamp: task.timestamp ?? "",
		})),
	});

	return { blocks };
}
