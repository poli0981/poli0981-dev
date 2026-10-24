import type { APIRoute } from "astro";
import { env } from "cloudflare:workers";
import { GITHUB_CONTENT_TOKEN } from "astro:env/server";
import { COLLECTIONS, collectionOf, type CollectionId } from "@/lib/admin/collections";
import { splitFile } from "@/lib/admin/frontmatter";
import { listContentFiles } from "@/lib/admin/github";
import { errorResponse, json } from "@/lib/admin/http";
import { configStatus } from "@/lib/admin/status";
import { listMedia } from "@/lib/media/process";
import type { WidgetsStatus } from "@/lib/widgets-types";

// The admin dashboard in one call: content counts per collection and language, the media
// library's size, the widgets cron's last run, and the deployment's configuration.
// Publish state stays with /api/admin/publish, which the header bar already polls.
export const prerender = false;

interface CollectionCount {
  id: CollectionId;
  label: string;
  total: number;
  drafts: number;
  vi: number;
  en: number;
}

export const GET: APIRoute = async () => {
  try {
    const kv = env.KV as KVNamespace | undefined;
    const [content, media, widgets] = await Promise.all([
      GITHUB_CONTENT_TOKEN ? listContentFiles(GITHUB_CONTENT_TOKEN) : null,
      listMedia(env),
      kv ? kv.get<WidgetsStatus>("widgets:status", "json") : null,
    ]);

    const counts = new Map<CollectionId, CollectionCount>(
      Object.values(COLLECTIONS).map((spec) => [
        spec.id,
        { id: spec.id, label: spec.label, total: 0, drafts: 0, vi: 0, en: 0 },
      ]),
    );
    for (const file of content?.files ?? []) {
      const spec = collectionOf(file.path);
      const count = spec ? counts.get(spec.id) : undefined;
      if (!count) continue;
      const { data } = splitFile(file.text);
      count.total += 1;
      if (data.draft === true) count.drafts += 1;
      if (data.lang === "vi") count.vi += 1;
      if (data.lang === "en") count.en += 1;
    }

    return json({
      content: content ? { head: content.head, collections: [...counts.values()] } : null,
      media: { count: media.length },
      widgets,
      config: configStatus(),
    });
  } catch (error) {
    return errorResponse(error);
  }
};
