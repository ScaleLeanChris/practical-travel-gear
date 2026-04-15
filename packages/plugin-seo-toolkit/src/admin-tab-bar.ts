export type Tab = "dashboard" | "rankings" | "backlinks" | "settings";
export type BacklinksSubTab = "domains" | "links" | "broken";

const TAB_CONFIG: Array<{ id: Tab; label: string }> = [
	{ id: "dashboard", label: "Dashboard" },
	{ id: "rankings", label: "Rankings" },
	{ id: "backlinks", label: "Backlinks" },
	{ id: "settings", label: "Settings" },
];

const SUBTAB_CONFIG: Array<{ id: BacklinksSubTab; label: string }> = [
	{ id: "domains", label: "Referring Domains" },
	{ id: "links", label: "Individual Links" },
	{ id: "broken", label: "Broken Links" },
];

export function buildTabBar(activeTab: Tab): any {
	return {
		type: "actions",
		elements: TAB_CONFIG.map((tab) => ({
			type: "button",
			label: tab.label,
			action_id: `tab:${tab.id}`,
			style: activeTab === tab.id ? "primary" : "default",
		})),
	};
}

export function buildSubTabBar(activeSubTab: BacklinksSubTab): any {
	return {
		type: "actions",
		elements: SUBTAB_CONFIG.map((sub) => ({
			type: "button",
			label: sub.label,
			action_id: `subtab:${sub.id}`,
			style: activeSubTab === sub.id ? "primary" : "default",
		})),
	};
}
