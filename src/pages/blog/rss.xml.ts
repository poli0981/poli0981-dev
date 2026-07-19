import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getAllBlogPosts } from "@/lib/collections";
import { blogFeedItem, RSS_XMLNS } from "@/lib/rss";
import { SITE } from "@/lib/seo";

/** Blog-only feed (both locales, 30 newest). */
export async function GET(context: APIContext) {
  const posts = await getAllBlogPosts();
  return rss({
    title: `${SITE.name} — blog`,
    description: SITE.defaultDescription.vi,
    site: context.site ?? SITE.url,
    xmlns: RSS_XMLNS,
    items: posts.slice(0, 30).map(blogFeedItem),
  });
}
