/**
 * The reference code on the 500 page. The page is static, so the Worker stamps the
 * request's Cloudflare Ray ID into its `#ref` span on the way out: the code a visitor
 * reads out or attaches to a bug report (ReportDialog reads #ref) is the `ray` field of
 * the matching Workers Logs line (lib/log `requestFields`).
 */
export function stampErrorRef(response: Response, ray: string | null): Response {
  const html = response.headers.get("content-type")?.includes("text/html") ?? false;
  if (!ray || response.status < 500 || !html) return response;
  return new HTMLRewriter()
    .on("#ref", {
      element(el) {
        el.setInnerContent(ray);
      },
    })
    .transform(response);
}
