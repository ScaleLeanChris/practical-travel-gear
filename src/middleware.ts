/**
 * Redirect middleware for WordPress URL compatibility.
 *
 * Uses a static map of 301 redirects extracted from the WordPress
 * Yoast SEO Premium redirect rules.
 */
import { defineMiddleware } from "astro:middleware";
import { wpRedirects } from "./data/wp-redirects";

export const onRequest = defineMiddleware(async (context, next) => {
	const { pathname } = context.url;

	// Check the WordPress redirect map
	const destination = wpRedirects[pathname];
	if (destination) {
		return context.redirect(destination, 301);
	}

	return next();
});
