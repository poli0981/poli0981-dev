import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { recordAudit } from "@/lib/admin/audit";
import { errorResponse, json, readJson } from "@/lib/admin/http";
import { configStatus } from "@/lib/admin/status";
import { inRange, isValidRange, readDenylist, writeDenylist, type DenyEntry } from "@/lib/denylist";
import { log } from "@/lib/log";

// The security page: the IP denylist (lib/denylist, enforced by src/worker.ts on every
// host — this admin included) and the deployment's configuration.
export const prerender = false;

/** Longest block the page offers: a year. Longer means "until removed" (no expiry). */
const MAX_HOURS = 24 * 366;

export const GET: APIRoute = async () => {
  try {
    const kv = env.KV as KVNamespace | undefined;
    return json({ denylist: kv ? await readDenylist(kv) : [], config: configStatus() });
  } catch (error) {
    return errorResponse(error);
  }
};

interface AddBody {
  cidr: string;
  reason?: string;
  /** Block for this many hours; absent = until removed. */
  hours?: number;
}

export const POST: APIRoute = async ({ request, locals }) => {
  const kv = env.KV as KVNamespace | undefined;
  if (!kv) return json({ error: "not_configured" }, 503);
  try {
    const input = await readJson<AddBody>(request);
    const cidr = typeof input?.cidr === "string" ? input.cidr.trim() : "";
    const reason = typeof input?.reason === "string" ? input.reason.trim().slice(0, 200) : "";
    const hours = input?.hours;
    if (
      !cidr ||
      !isValidRange(cidr) ||
      (hours !== undefined && (!Number.isInteger(hours) || hours < 1 || hours > MAX_HOURS))
    ) {
      return json({ error: "invalid" }, 400);
    }
    // The list applies to every host, this admin included: never let it lock its owner out.
    const self = request.headers.get("cf-connecting-ip");
    if (self && inRange(self, cidr)) return json({ error: "self_block" }, 400);

    const now = Date.now();
    const entry: DenyEntry = {
      cidr,
      ...(reason ? { reason } : {}),
      ...(hours ? { until: new Date(now + hours * 3_600_000).toISOString() } : {}),
      added: new Date(now).toISOString(),
    };
    const current = await readDenylist(kv);
    const denylist = await writeDenylist(kv, [...current.filter((e) => e.cidr !== cidr), entry]);
    const admin = locals.admin?.email ?? "unknown";
    await recordAudit(kv, { admin, action: "denylist.add", target: cidr, detail: reason });
    log.info("admin.denylist_added", { cidr, hours, admin });
    return json({ denylist });
  } catch (error) {
    return errorResponse(error);
  }
};

export const DELETE: APIRoute = async ({ request, locals }) => {
  const kv = env.KV as KVNamespace | undefined;
  if (!kv) return json({ error: "not_configured" }, 503);
  try {
    const input = await readJson<{ cidr: string }>(request);
    if (typeof input?.cidr !== "string") return json({ error: "invalid" }, 400);
    const current = await readDenylist(kv);
    if (!current.some((entry) => entry.cidr === input.cidr))
      return json({ error: "not_found" }, 404);
    const denylist = await writeDenylist(
      kv,
      current.filter((entry) => entry.cidr !== input.cidr),
    );
    const admin = locals.admin?.email ?? "unknown";
    await recordAudit(kv, { admin, action: "denylist.remove", target: input.cidr });
    log.info("admin.denylist_removed", { cidr: input.cidr, admin });
    return json({ denylist });
  } catch (error) {
    return errorResponse(error);
  }
};
