import rss from "@astrojs/rss";
import type { APIContext } from "astro";
import { getAllBlogPosts, getAllStoryChapters } from "@/lib/collections";
import { blogFeedItem, storyFeedItem, RSS_XMLNS } from "@/lib/rss";
import { SITE } from "@/lib/seo";

/** Combined feed: newest blog posts + story chapters across both locales (30 items). */
export async function GET(context: APIContext) {
  const [posts, stories] = await Promise.all([getAllBlogPosts(), getAllStoryChapters()]);
  const items = [...posts.map(blogFeedItem), ...stories.map(storyFeedItem)]
    .sort((a, b) => (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0))
    .slice(0, 30);
  return rss({
    title: `${SITE.name} — blog & truyện`,
    description: SITE.defaultDescription.vi,
    site: context.site ?? SITE.url,
    xmlns: RSS_XMLNS,
    items,
  });
}
