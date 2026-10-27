// Spam a URL from this machine and report who answered 429: the Worker's site-wide limit
// (RL_SITE — the site's own 429 page, Retry-After: 10) or the zone WAF rate-limiting rule
// (Cloudflare's "Error 1015" page, before the Worker runs). Docs 06 §2 and 07 §6.
//
//   npm run probe:ratelimit -- [url] [requests] [parallel]
//   defaults: https://poli0981.dev/legal/privacy/ 300 20
//
// The default page skips the Turnstile gate, so a 200 is the real page. Every request spends
// this address's budget: expect 429s from the site for the next ~10 seconds.

const url = process.argv[2] ?? "https://poli0981.dev/legal/privacy/";
const total = Number(process.argv[3] ?? 300);
const parallel = Number(process.argv[4] ?? 20);

/** "worker 429" | "waf 429" | the status code as text. */
async function probe() {
  const response = await fetch(url, {
    redirect: "manual",
    headers: { "user-agent": "poli0981-ratelimit-probe" },
    signal: AbortSignal.timeout(15000),
  });
  const body = await response.text();
  if (response.status !== 429) return String(response.status);
  // The site's 429 page carries the countdown span; the WAF's block page never does.
  return body.includes('id="cd"') ? "worker 429" : "waf 429";
}

const results = [];
const firstAt = {};
const started = Date.now();
let next = 0;
await Promise.all(
  Array.from({ length: parallel }, async () => {
    while (next < total) {
      const index = next++;
      const kind = await probe().catch((error) => `error (${error.name})`);
      results.push(kind);
      firstAt[kind] = Math.min(firstAt[kind] ?? Infinity, index + 1);
    }
  }),
);

const seconds = ((Date.now() - started) / 1000).toFixed(1);
console.log(`${total} requests to ${url} in ${seconds}s (${parallel} in parallel)`);
const counts = Object.groupBy(results, (kind) => kind);
for (const [kind, hits] of Object.entries(counts)) {
  console.log(
    `  ${kind.padEnd(12)} ${String(hits.length).padStart(5)}   first at #${firstAt[kind]}`,
  );
}
if (!counts["worker 429"] && !counts["waf 429"]) {
  console.log("no 429 at all — the limits were not reached (more requests or more parallel?)");
}
