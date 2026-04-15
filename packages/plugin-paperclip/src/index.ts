import type { PluginDescriptor } from "emdash";

export function paperclipPlugin(): PluginDescriptor {
	return {
		id: "paperclip",
		version: "1.0.0",
		format: "standard",
		entrypoint: "plugin-paperclip/sandbox",
		options: {},
		capabilities: ["read:content", "network:fetch"],
		allowedHosts: ["*"],
		storage: {
			event_log: {
				indexes: ["eventType", "collection", "timestamp"],
			},
			tasks: {
				indexes: ["status", "agentId", "updatedAt"],
			},
		},
		adminPages: [
			{ path: "/dashboard", label: "Paperclip", icon: "cpu" },
			{ path: "/activity", label: "Activity Log", icon: "activity" },
			{ path: "/settings", label: "Settings", icon: "settings" },
		],
	};
}
