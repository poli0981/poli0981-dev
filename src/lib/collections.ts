import { getCollection, type CollectionEntry } from "astro:content";
import type { Locale } from "../i18n/routing";

export type BlogEntry = CollectionEntry<"blog">;
export type StoryEntry = CollectionEntry<"stories">;
export type ProjectEntry = CollectionEntry<"projects">;
export type FaqEntry = CollectionEntry<"faq">;

/** Drafts are visible in `astro dev` but excluded from production builds. */
const INCLUDE_DRAFTS = import.meta.env.DEV;

function byDateDesc(a: { data: { date: Date } }, b: { data: { date: Date } }): number {
  return b.data.date.getTime() - a.data.date.getTime();
}

export async function getBlogPosts(locale: Locale): Promise<BlogEntry[]> {
  const posts = await getCollection(
    "blog",
    ({ data }) => (INCLUDE_DRAFTS || !data.draft) && data.lang === locale,
  );
  return posts.sort(byDateDesc);
}

export async function getStoryChapters(locale: Locale): Promise<StoryEntry[]> {
  const chapters = await getCollection(
    "stories",
    ({ data }) => (INCLUDE_DRAFTS || !data.draft) && data.lang === locale,
  );
  return chapters.sort(byDateDesc);
}

export async function getProjects(locale: Locale): Promise<ProjectEntry[]> {
  const projects = await getCollection(
    "projects",
    ({ data }) => (INCLUDE_DRAFTS || !data.draft) && data.lang === locale,
  );
  // Featured first, then newest year.
  return projects.sort(
    (a, b) => Number(b.data.featured) - Number(a.data.featured) || b.data.year - a.data.year,
  );
}

export async function getFaqs(locale: Locale): Promise<FaqEntry[]> {
  const faqs = await getCollection("faq", ({ data }) => data.lang === locale);
  return faqs.sort((a, b) => a.data.order - b.data.order);
}

export type MixedItem = { kind: "blog"; entry: BlogEntry } | { kind: "story"; entry: StoryEntry };

/** Newest blog + story items merged, for the homepage "recently written" strip. */
export async function getLatestMixed(locale: Locale, limit = 3): Promise<MixedItem[]> {
  const [blog, stories] = await Promise.all([getBlogPosts(locale), getStoryChapters(locale)]);
  const merged: MixedItem[] = [
    ...blog.map((entry) => ({ kind: "blog" as const, entry })),
    ...stories.map((entry) => ({ kind: "story" as const, entry })),
  ];
  merged.sort((a, b) => b.entry.data.date.getTime() - a.entry.data.date.getTime());
  return merged.slice(0, limit);
}

/** Estimated reading time in minutes (~200 wpm; fine for both vi and en). */
export function readingTime(body: string | undefined): number {
  if (!body) return 1;
  const words = body.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.round(words / 200));
}

/** Unique tags with counts, most frequent first. */
export function collectTags(entries: { data: { tags: string[] } }[]): {
  tag: string;
  count: number;
}[] {
  const counts = new Map<string, number>();
  for (const entry of entries) {
    for (const tag of entry.data.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

type Translatable = "blog" | "stories" | "projects";

/** The counterpart entry in the other locale, matched by translationKey (or null). */
export async function findTranslation<C extends Translatable>(
  collection: C,
  entry: CollectionEntry<C>,
): Promise<CollectionEntry<C> | null> {
  const data = entry.data as { translationKey?: string; lang: Locale };
  if (!data.translationKey) return null;
  const otherLang: Locale = data.lang === "vi" ? "en" : "vi";
  const matches = await getCollection(collection, ({ data: d }) => {
    const dd = d as { translationKey?: string; lang: Locale };
    return dd.translationKey === data.translationKey && dd.lang === otherLang;
  });
  return (matches[0] as CollectionEntry<C>) ?? null;
}

/** Split a stories entry id ("series-slug/chapter-slug" or "one-shot") into parts. */
export function parseStoryId(id: string): { series: string | null; slug: string } {
  const parts = id.split("/");
  if (parts.length >= 2) return { series: parts[0], slug: parts.slice(1).join("/") };
  return { series: null, slug: id };
}
