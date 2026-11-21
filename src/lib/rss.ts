import type { RSSFeedItem } from "@astrojs/rss";
import { useTranslations } from "../i18n";
import { sectionPath, type Locale } from "../i18n/routing";
import type { BlogEntry, StoryEntry } from "./collections";
import { warningPrefix, type AgeRating } from "./content-labels";

function langTag(locale: Locale): string {
  return locale === "vi" ? "vi-vn" : "en-us";
}

/**
 * The description, led by the item's content warning in its own language ("[Cảnh báo: Kinh
 * dị · 16+] …"): a feed reader shows no banner, so the warning has to travel with the text.
 */
function described(data: {
  description: string;
  lang: Locale;
  contentWarning?: string[];
  ageRating?: AgeRating;
}): string {
  const t = useTranslations(data.lang);
  const prefix = warningPrefix(data.contentWarning ?? [], data.ageRating, {
    prefix: t.cw.feedPrefix,
    names: t.labels,
  });
  return `${prefix}${data.description}`;
}

/** Blog item — description + categories. Full-content HTML is deferred (doc 13 §4). */
export function blogFeedItem(post: BlogEntry): RSSFeedItem {
  return {
    title: post.data.title,
    link: sectionPath("blog", post.data.lang, post.id),
    pubDate: post.data.date,
    description: described(post.data),
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
    description: described(chapter.data),
    customData: `<dc:language>${langTag(chapter.data.lang)}</dc:language>`,
  };
}

/** Namespace for the per-item <dc:language> element (feeds mix vi + en). */
export const RSS_XMLNS = { dc: "http://purl.org/dc/elements/1.1/" };
