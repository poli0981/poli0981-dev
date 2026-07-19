import type { RSSFeedItem } from "@astrojs/rss";
import { sectionPath, type Locale } from "../i18n/routing";
import type { BlogEntry, StoryEntry } from "./collections";

function langTag(locale: Locale): string {
  return locale === "vi" ? "vi-vn" : "en-us";
}

/** Blog item — description + categories. Full-content HTML is deferred (doc 13 §4). */
export function blogFeedItem(post: BlogEntry): RSSFeedItem {
  return {
    title: post.data.title,
    link: sectionPath("blog", post.data.lang, post.id),
    pubDate: post.data.date,
    description: post.data.description,
    categories: post.data.tags,
    customData: `<dc:language>${langTag(post.data.lang)}</dc:language>`,
  };
}

/** Story item — description + link ONLY (all rights reserved); never emit chapter content. */
export function storyFeedItem(chapter: StoryEntry): RSSFeedItem {
  return {
    title: chapter.data.title,
    link: sectionPath("stories", chapter.data.lang, ...chapter.id.split("/")),
    pubDate: chapter.data.date,
    description: chapter.data.description,
    customData: `<dc:language>${langTag(chapter.data.lang)}</dc:language>`,
  };
}

/** Namespace for the per-item <dc:language> element (feeds mix vi + en). */
export const RSS_XMLNS = { dc: "http://purl.org/dc/elements/1.1/" };
