import type { PluginDescriptor } from "emdash";

export function hyperagentPlugin(): PluginDescriptor {
	return {
		id: "hyperagent",
		version: "1.0.0",
		format: "standard",
		entrypoint: "plugin-hyperagent/sandbox",
		options: {},
		capabilities: ["network:fetch"],
		allowedHosts: ["hyperagent.com", "*.hyperagent.com"],
		storage: {
			task_log: {
				indexes: [
					"status",
					"priority",
					"source",
					"destinationId",
					"taskType",
					"timestamp",
				],
			},
		},
		adminPages: [
			{ path: "/tasks", label: "Hyperagent", icon: "cpu" },
			{ path: "/activity", label: "Activity Log", icon: "activity" },
			{ path: "/settings", label: "Settings", icon: "settings" },
		],
	};
}
