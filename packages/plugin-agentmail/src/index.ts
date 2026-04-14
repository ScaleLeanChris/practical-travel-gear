import type { PluginDescriptor } from "emdash";

export function agentMailPlugin(): PluginDescriptor {
	return {
		id: "agentmail",
		version: "1.0.0",
		format: "standard",
		entrypoint: "plugin-agentmail/sandbox",
		options: {},
		capabilities: ["email:provide", "email:intercept", "network:fetch"],
		allowedHosts: ["api.agentmail.to"],
		adminPages: [
			{ path: "/settings", label: "AgentMail Settings", icon: "mail" },
		],
	};
}
