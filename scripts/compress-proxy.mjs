// Lighthouse CI only (.github/workflows/lighthouse.yml): compress what `astro preview` serves,
// the way Cloudflare's edge compresses every text response in production. The preview sends
// HTML, CSS and JS uncompressed, so the simulated phone downloaded three to four times the
// bytes a real one does and LCP went over budget on transfer time alone.
//
//   node scripts/compress-proxy.mjs <listen port> <preview port>
import { createServer, request } from "node:http";
import { constants, createBrotliCompress, createGzip } from "node:zlib";

const [listenPort, previewPort] = process.argv.slice(2).map(Number);
const TEXT = /^(?:text\/|application\/(?:javascript|json|manifest\+json|xml)|image\/svg\+xml)/;

/** br or gzip when the browser takes it and the response is uncompressed text; else null. */
function encodingFor(req, upstream) {
  if (req.method === "HEAD" || upstream.headers["content-encoding"]) return null;
  if (!TEXT.test(upstream.headers["content-type"] ?? "")) return null;
  const accepted = String(req.headers["accept-encoding"] ?? "");
  if (accepted.includes("br")) return "br";
  if (accepted.includes("gzip")) return "gzip";
  return null;
}

createServer((req, res) => {
  const proxied = request(
    {
      hostname: "localhost",
      port: previewPort,
      path: req.url,
      method: req.method,
      headers: { ...req.headers, "accept-encoding": "identity" },
    },
    (upstream) => {
      const status = upstream.statusCode ?? 502;
      const encoding = encodingFor(req, upstream);
      if (!encoding) {
        res.writeHead(status, upstream.headers);
        upstream.pipe(res);
        return;
      }
      const headers = {
        ...upstream.headers,
        "content-encoding": encoding,
        vary: "accept-encoding",
      };
      delete headers["content-length"];
      res.writeHead(status, headers);
      // Quality 4: about what Cloudflare spends on a response it compresses on the fly.
      const compress =
        encoding === "br"
          ? createBrotliCompress({ params: { [constants.BROTLI_PARAM_QUALITY]: 4 } })
          : createGzip();
      upstream.pipe(compress).pipe(res);
    },
  );
  proxied.on("error", () => res.writeHead(502).end());
  req.pipe(proxied);
}).listen(listenPort);
