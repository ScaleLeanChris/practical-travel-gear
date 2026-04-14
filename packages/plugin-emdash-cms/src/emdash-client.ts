/**
 * HTTP client for calling the EmDash plugin-paperclip inbound API.
 * Used by the Paperclip plugin to query CMS content and SEO data.
 */

export interface EmDashClientConfig {
	siteUrl: string;
	apiSecret: string;
}

export interface ApiResponse<T = unknown> {
	ok: boolean;
	data?: T;
	error?: string;
}

export class EmDashClient {
	private siteUrl: string;
	private apiSecret: string;
	private fetchFn: typeof fetch;

	constructor(config: EmDashClientConfig, fetchFn: typeof fetch) {
		this.siteUrl = config.siteUrl.replace(/\/+$/, "");
		this.apiSecret = config.apiSecret;
		this.fetchFn = fetchFn;
	}

	private async request<T>(
		action: string,
		params?: Record<string, unknown>,
	): Promise<ApiResponse<T>> {
		const url = `${this.siteUrl}/_emdash/plugins/paperclip/api`;
		const response = await this.fetchFn(url, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				action,
				secret: this.apiSecret,
				params: params ?? {},
			}),
		});

		if (!response.ok) {
			return {
				ok: false,
				error: `HTTP ${response.status}: ${await response.text()}`,
			};
		}

		return (await response.json()) as ApiResponse<T>;
	}

	async listContent(
		collection: string,
		limit?: number,
	): Promise<ApiResponse> {
		return this.request("list_content", { collection, limit });
	}

	async getContent(
		collection: string,
		slug: string,
	): Promise<ApiResponse> {
		return this.request("get_content", { collection, slug });
	}

	async getSeoScore(entryId: string): Promise<ApiResponse> {
		return this.request("get_seo_score", { entryId });
	}

	async getSeoScores(collection?: string): Promise<ApiResponse> {
		return this.request("get_seo_scores", { collection });
	}

	async getAuditResult(entryId: string): Promise<ApiResponse> {
		return this.request("get_audit_result", { entryId });
	}

	async getAuditResults(collection?: string): Promise<ApiResponse> {
		return this.request("get_audit_results", { collection });
	}

	async getSeoSummary(): Promise<ApiResponse> {
		return this.request("get_seo_summary");
	}

	async getKeywords(): Promise<ApiResponse> {
		return this.request("get_keywords");
	}

	async getBacklinks(): Promise<ApiResponse> {
		return this.request("get_backlinks");
	}
}
