import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getAllStoryChapters } from "@/lib/collections";
import { storyFeedItem, RSS_XMLNS } from "@/lib/rss";
import { SITE } from "@/lib/seo";

/** Story-only feed (both locales, 30 newest). Description + link only (ARR). */
export async function GET(context: APIContext) {
  const stories = await getAllStoryChapters();
  return rss({
    title: `${SITE.name} — truyện`,
    description: SITE.defaultDescription.vi,
    site: context.site ?? SITE.url,
    xmlns: RSS_XMLNS,
    items: stories.slice(0, 30).map(storyFeedItem),
  });
}
