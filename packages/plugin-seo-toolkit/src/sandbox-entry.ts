import { definePlugin } from "emdash";
import type { PluginContext } from "emdash";
import { runAudit } from "./audit.js";
import { refreshDomainData } from "./dataforseo.js";
import { analyzeContent } from "./analysis.js";
import { buildDashboardTab } from "./admin-dashboard.js";
import { buildRankingsTab } from "./admin-rankings.js";
import { buildBacklinksTab } from "./admin-backlinks.js";
import { buildSettingsTab, saveSettings } from "./admin-settings.js";
import { buildTabBar } from "./admin-tab-bar.js";
import type { Tab, BacklinksSubTab } from "./admin-tab-bar.js";

async function getDomain(ctx: PluginContext): Promise<string> {
  return (await ctx.kv.get<string>("settings:domain")) ?? "practicaltravelgear.com";
}

async function renderTab(ctx: PluginContext, tab: Tab, subTab?: BacklinksSubTab): Promise<any> {
  let tabBlocks: any[];
  switch (tab) {
    case "dashboard":
      tabBlocks = await buildDashboardTab(ctx);
      break;
    case "rankings":
      tabBlocks = await buildRankingsTab(ctx);
      break;
    case "backlinks":
      tabBlocks = await buildBacklinksTab(ctx, subTab ?? "domains");
      break;
    case "settings":
      tabBlocks = await buildSettingsTab(ctx);
      break;
    default:
      tabBlocks = await buildDashboardTab(ctx);
  }
  return { blocks: [buildTabBar(tab), ...tabBlocks] };
}

export default definePlugin({
  hooks: {
    "content:afterSave": {
      priority: 200,
      timeout: 15000,
      errorPolicy: "continue",
      handler: async (event: any, ctx: PluginContext) => {
        try {
          await analyzeContent(ctx, event.content, event.collection);
        } catch (err) {
          ctx.log.warn("SEO analysis failed", err);
        }
      },
    },

    cron: {
      handler: async (_event: any, ctx: PluginContext) => {
        const autoRefresh =
          (await ctx.kv.get<boolean>("settings:autoRefresh")) ?? true;
        if (!autoRefresh) return;

        const domain = await getDomain(ctx);
        ctx.log.info("SEO weekly refresh starting", { domain });

        const { calls, errors } = await refreshDomainData(ctx, domain);
        if (errors.length > 0) {
          ctx.log.warn("DataForSEO refresh had errors", { errors });
        }
        ctx.log.info(`DataForSEO refresh complete: ${calls} API calls`);

        const results = await runAudit(ctx);
        ctx.log.info(
          `Content audit complete: ${results.length} entries scanned`,
        );

        // Save audit summary for trend comparison
        if (results.length > 0) {
          const totalScore = results.reduce((sum, r) => sum + r.score, 0);
          const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
          await ctx.kv.set("prev_audit_summary", {
            avgScore: Math.round(totalScore / results.length),
            totalIssues,
            count: results.length,
          });
        }

        await ctx.kv.set("settings:lastRefresh", new Date().toISOString());
      },
    },
  },

  routes: {
    admin: {
      handler: async (routeCtx: any, ctx: PluginContext) => {
        const interaction = routeCtx.input;

        // Page load — default to dashboard
        if (interaction.type === "page_load") {
          return renderTab(ctx, "dashboard");
        }

        // Settings form submit
        if (interaction.type === "form_submit") {
          if (interaction.action_id === "save_seo_settings") {
            await saveSettings(ctx, interaction.values ?? {});
            return {
              ...(await renderTab(ctx, "settings")),
              toast: { message: "Settings saved", type: "success" as const },
            };
          }
        }

        // Block actions — tabs, sub-tabs, and action buttons
        if (interaction.type === "block_action") {
          const actionId: string = interaction.action_id ?? "";

          // Tab navigation
          if (actionId.startsWith("tab:")) {
            const tab = actionId.slice(4) as Tab;
            return renderTab(ctx, tab);
          }

          // Backlinks sub-tab navigation
          if (actionId.startsWith("subtab:")) {
            const subTab = actionId.slice(7) as BacklinksSubTab;
            return renderTab(ctx, "backlinks", subTab);
          }

          // Fetch data (from rankings or backlinks tab)
          if (actionId.startsWith("refresh_data")) {
            const returnTab = actionId === "refresh_data:backlinks" ? "backlinks" : "rankings";
            const domain = await getDomain(ctx);
            try {
              const { calls, errors } = await refreshDomainData(ctx, domain);
              await ctx.kv.set("settings:lastRefresh", new Date().toISOString());
              return {
                ...(await renderTab(ctx, returnTab as Tab)),
                toast: {
                  message:
                    errors.length > 0
                      ? `Refreshed with ${errors.length} error(s): ${errors[0]}`
                      : `Data refreshed (${calls} API calls)`,
                  type: errors.length > 0 ? ("warning" as const) : ("success" as const),
                },
              };
            } catch (err) {
              return {
                ...(await renderTab(ctx, returnTab as Tab)),
                toast: {
                  message: `Refresh failed: ${err instanceof Error ? err.message : String(err)}`,
                  type: "error" as const,
                },
              };
            }
          }

          // Run content audit (from dashboard tab)
          if (actionId === "run_audit") {
            try {
              const results = await runAudit(ctx);
              // Save audit summary for trend comparison
              if (results.length > 0) {
                const totalScore = results.reduce((sum, r) => sum + r.score, 0);
                const totalIssues = results.reduce((sum, r) => sum + r.issues.length, 0);
                await ctx.kv.set("prev_audit_summary", {
                  avgScore: Math.round(totalScore / results.length),
                  totalIssues,
                  count: results.length,
                });
              }
              return {
                ...(await renderTab(ctx, "dashboard")),
                toast: {
                  message: `Audit complete: ${results.length} entries scanned`,
                  type: "success" as const,
                },
              };
            } catch (err) {
              return {
                ...(await renderTab(ctx, "dashboard")),
                toast: {
                  message: `Audit failed: ${err instanceof Error ? err.message : String(err)}`,
                  type: "error" as const,
                },
              };
            }
          }
        }

        return { blocks: [] };
      },
    },
  },
});
