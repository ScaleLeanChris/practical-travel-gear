/// <reference path="../emdash-env.d.ts" />

import type { EntryResult } from "emdash";

declare global {
	namespace App {
		interface Locals {
			/**
			 * Prefetched entry set by the root catch-all route, so the target
			 * route (`/posts/:slug` or `/pages/:slug`) can skip a redundant
			 * D1 lookup after an internal rewrite.
			 */
			prefetchedEntry?: {
				collection: "posts" | "pages";
				slug: string;
				result: EntryResult<unknown>;
			};
		}
	}
}

export {};
