// Which host serves what. The admin has its own origin behind Cloudflare Access and the
// public site never serves it: an XSS on a public page could otherwise drive the admin API
// with the Access cookie (sibling subdomains are same-site, but not same-origin).
// Pure — unit-tested in tests/hosts.test.ts.

const SITE_HOST = "poli0981.dev";
const ADMIN_HOST = "admin.poli0981.dev";
const ADMIN_PATH = /^\/(api\/)?admin(\/|$)/;

/** A redirect/404 that keeps admin and public content on their own hosts, or null. */
export function routeHosts(url: URL): Response | null {
  if (url.hostname === ADMIN_HOST) {
    if (url.pathname === "/") return Response.redirect(`${url.origin}/admin/`, 302);
    if (ADMIN_PATH.test(url.pathname) || url.pathname.startsWith("/media/")) return null;
    return Response.redirect(`https://${SITE_HOST}${url.pathname}${url.search}`, 301);
  }
  if (url.hostname === SITE_HOST && ADMIN_PATH.test(url.pathname)) {
    if (url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    return Response.redirect(`https://${ADMIN_HOST}${url.pathname}${url.search}`, 301);
  }
  return null;
}
