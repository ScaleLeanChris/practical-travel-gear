import type { PluginContext } from "emdash";
import {
	DEFAULT_DESTINATIONS_JSON,
	destinationOptions,
	parseDestinations,
} from "./hyperagent-client.js";

export async function buildTasksPage(ctx: PluginContext) {
	const destinationsJson =
		(await ctx.kv.get<string>("settings:destinationsJson")) ??
		DEFAULT_DESTINATIONS_JSON;
	const destinations = parseDestinations(destinationsJson);
	const options = destinationOptions(destinations);
	const defaultDestinationId =
		(await ctx.kv.get<string>("settings:defaultDestinationId")) ??
		options[0]?.value ??
		"seo";
	const connected = destinations.some((destination) => destination.webhookUrl);

	let recentTasks: any[] = [];
	try {
		const { items } = await ctx.storage.task_log.query({
			orderBy: { timestamp: "desc" },
			limit: 10,
		});
		recentTasks = items;
	} catch {
		// Storage may be empty on first load.
	}

	const blocks: any[] = [
		{ type: "header", text: "Hyperagent Tasks" },
		{
			type: "context",
			text: connected
				? `${destinations.filter((destination) => destination.webhookUrl).length} destination webhook(s) configured`
				: "Configure at least one Hyperagent destination in Settings before sending tasks.",
		},
		{ type: "divider" },
		{
			type: "form",
			block_id: "hyperagent-task",
			fields: [
				{
					type: "select",
					action_id: "destinationId",
					label: "Destination",
					options,
					initial_value: defaultDestinationId,
				},
				{
					type: "select",
					action_id: "taskType",
					label: "Task Type",
					options: taskTypeOptions(),
					initial_value: "general",
				},
				{
					type: "text_input",
					action_id: "customTaskType",
					label: "Custom Task Type (overrides dropdown above)",
					placeholder: "Leave blank to use dropdown selection",
				},
				{
					type: "text_input",
					action_id: "title",
					label: "Task Title",
					placeholder: "Review the latest gear guide",
				},
				{
					type: "text_input",
					action_id: "instructions",
					label: "Instructions",
					placeholder: "Describe the work Hyperagent should do.",
					multiline: true,
				},
				{
					type: "select",
					action_id: "priority",
					label: "Priority",
					options: [
						{ label: "Normal", value: "normal" },
						{ label: "Low", value: "low" },
						{ label: "High", value: "high" },
						{ label: "Urgent", value: "urgent" },
					],
					initial_value: "normal",
				},
				{
					type: "text_input",
					action_id: "contentUrl",
					label: "Content URL",
					placeholder: "https://practicaltravelgear.com/example",
				},
				{
					type: "text_input",
					action_id: "labels",
					label: "Labels",
					placeholder: "editorial, seo, qa",
				},
			],
			submit: {
				label: "Send Task",
				action_id: "send_hyperagent_task",
			},
		},
		{ type: "divider" },
		{
			type: "actions",
			elements: [
				{
					type: "button",
					text: "Send Test Task",
					action_id: "send_test_task",
					style: "primary",
				},
			],
		},
		{ type: "divider" },
		{ type: "section", text: "**Recent Tasks**" },
	];

	if (recentTasks.length === 0) {
		blocks.push({ type: "context", text: "No recent task activity." });
	} else {
		blocks.push({
			type: "table",
			columns: [
				{ key: "title", label: "Task" },
				{ key: "destination", label: "Destination" },
				{ key: "taskType", label: "Type" },
				{ key: "source", label: "Source" },
				{ key: "status", label: "Status" },
				{ key: "timestamp", label: "Time", format: "relative_time" },
			],
			rows: recentTasks.map((task: any) => ({
				title: task.title ?? "Untitled",
				destination: task.destinationLabel ?? task.destinationId ?? "—",
				taskType: task.taskType ?? "general",
				source: task.source ?? "—",
				status: task.status === "sent" ? "Sent" : "Failed",
				timestamp: task.timestamp ?? "",
			})),
		});
	}

	return { blocks };
}

function taskTypeOptions() {
	return [
		{ label: "General", value: "general" },
		{ label: "SEO optimize", value: "seo.optimize" },
		{ label: "SEO analyze", value: "seo.analyze" },
		{ label: "SEO audit", value: "seo.audit" },
		{ label: "Writing revision", value: "writing.revision" },
		{ label: "New content", value: "writing.new_content" },
		{ label: "Writing brief", value: "writing.brief" },
		{ label: "Content graphics", value: "graphics.content" },
		{ label: "Video", value: "graphics.video" },
		{ label: "Thumbnail", value: "graphics.thumbnail" },
	];
}
