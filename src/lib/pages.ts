import {
  getBlogPosts,
  getStoryChapters,
  getProjects,
  getGalleryAlbums,
  parseStoryId,
  type BlogEntry,
  type StoryEntry,
} from "./collections";
import { getAlbumPhotos } from "./gallery";
import { sectionPath, type Locale } from "../i18n/routing";

interface NavLink {
  href: string;
  label: string;
}

const storyHref = (locale: Locale, entry: StoryEntry) =>
  sectionPath("stories", locale, ...entry.id.split("/"));

interface StoryChapterPath {
  params: { series: string; slug: string };
  props: {
    entry: StoryEntry;
    prev: NavLink | null;
    next: NavLink | null;
    seriesTocHref: string;
  };
}

/** getStaticPaths for blog post detail pages, with prev/next (older/newer) links. */
export async function blogPostPaths(locale: Locale) {
  const posts = await getBlogPosts(locale);
  return posts.map((entry, i) => {
    const newer = posts[i - 1]; // list is newest-first
    const older = posts[i + 1];
    const linkTo = (p: BlogEntry): NavLink => ({
      href: sectionPath("blog", locale, p.id),
      label: p.data.title,
    });
    return {
      params: { slug: entry.id },
      props: {
        entry,
        prev: older ? linkTo(older) : null, // "prev" = older post
        next: newer ? linkTo(newer) : null, // "next" = newer post
      },
    };
  });
}

/** getStaticPaths for blog tag pages. */
export async function blogTagPaths(locale: Locale) {
  const posts = await getBlogPosts(locale);
  const tags = [...new Set(posts.flatMap((p) => p.data.tags))];
  return tags.map((tag) => ({
    params: { tag },
    props: { tag, posts: posts.filter((p) => p.data.tags.includes(tag)) },
  }));
}

/** getStaticPaths for project detail pages. */
export async function projectPaths(locale: Locale) {
  const projects = await getProjects(locale);
  return projects.map((entry) => ({ params: { slug: entry.id }, props: { entry } }));
}

/** getStaticPaths for gallery album detail pages. Album slug = the shared folder name,
 *  so vi and en resolve to the same `/gallery/<album>` slug (LangSwitch works via
 *  alternatePath). Two entries in one locale must not share an `album` value. */
export async function galleryAlbumPaths(locale: Locale) {
  const albums = await getGalleryAlbums(locale);
  return albums.map((entry) => ({
    params: { album: entry.data.album },
    props: { entry, photos: getAlbumPhotos(entry.data.album) },
  }));
}

/**
 * getStaticPaths for story chapter reader pages (/truyen/[series]/[slug]).
 * Only chapters that live in a series folder produce routes; prev/next walk the
 * chapter order within the same series.
 */
export async function storyChapterPaths(locale: Locale) {
  const all = await getStoryChapters(locale);
  const bySeries = new Map<string, StoryEntry[]>();
  for (const chapter of all) {
    const { series } = parseStoryId(chapter.id);
    if (!series) continue; // one-shots without a series folder are skipped for this route
    const existing = bySeries.get(series);
    if (existing) existing.push(chapter);
    else bySeries.set(series, [chapter]);
  }

  const paths: StoryChapterPath[] = [];
  for (const [series, list] of bySeries) {
    list.sort(
      (a, b) =>
        (a.data.chapter ?? 0) - (b.data.chapter ?? 0) ||
        a.data.date.getTime() - b.data.date.getTime(),
    );
    list.forEach((entry, i) => {
      const { slug } = parseStoryId(entry.id);
      const earlier = list[i - 1];
      const later = list[i + 1];
      paths.push({
        params: { series, slug },
        props: {
          entry,
          prev: earlier ? { href: storyHref(locale, earlier), label: earlier.data.title } : null,
          next: later ? { href: storyHref(locale, later), label: later.data.title } : null,
          seriesTocHref: sectionPath("stories", locale),
        },
      });
    });
  }
  return paths;
}
