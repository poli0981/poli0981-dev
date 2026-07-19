import type { APIRoute } from "astro";

// Deliberate 500 trigger for the docs-09 error matrix (verifies 500.astro renders).
// Remove or gate before public launch.
export const prerender = false;

export const GET: APIRoute = () => {
  throw new Error("Boom — deliberate 500 for error-page testing.");
};
