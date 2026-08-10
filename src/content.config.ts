import { defineCollection, z, type SchemaContext } from "astro:content";
import { glob } from "astro/loaders";

const LANG = z.enum(["vi", "en"]);

/** Fields shared by long-form content (blog + stories). */
const base = ({ image }: SchemaContext) =>
  z.object({
    title: z.string().max(120),
    description: z.string().max(200),
    lang: LANG,
    // Links a vi post to its en translation (and vice-versa).
    translationKey: z.string().optional(),
    date: z.coerce.date(),
    updated: z.coerce.date().optional(),
    tags: z.array(z.string()).default([]),
    cover: image().optional(),
    draft: z.boolean().default(false),
  });

// Markdown/MDX files, ignoring `_`-prefixed partials.
const contentGlob = (dir: string) =>
  glob({ pattern: "**/[^_]*.{md,mdx}", base: `./src/content/${dir}` });

const blog = defineCollection({
  loader: contentGlob("blog"),
  // suggested tags: dev-log, diary, share, gaming
  schema: (ctx) => base(ctx),
});

const stories = defineCollection({
  loader: contentGlob("stories"),
  schema: (ctx) =>
    base(ctx).extend({
      series: z.string().optional(),
      chapter: z.number().int().positive().optional(),
      status: z.enum(["ongoing", "complete", "dropped"]).default("ongoing"),
      contentWarning: z.array(z.string()).default([]), // e.g. ['horror', 'blood']
    }),
});

const projects = defineCollection({
  loader: contentGlob("projects"),
  schema: ({ image }) =>
    z.object({
      name: z.string().max(120),
      tagline: z.string().max(200),
      lang: LANG,
      translationKey: z.string().optional(),
      stack: z.array(z.string()).default([]),
      repo: z.url().optional(),
      url: z.url().optional(),
      status: z.enum(["active", "maintained", "archived"]).default("active"),
      featured: z.boolean().default(false),
      year: z.number(),
      cover: image().optional(),
      draft: z.boolean().default(false),
    }),
});

const faq = defineCollection({
  loader: contentGlob("faq"),
  schema: z.object({
    q: z.string(),
    lang: LANG,
    group: z.enum(["channel", "dev", "personal"]),
    order: z.number().default(0),
  }),
});

const gallery = defineCollection({
  loader: contentGlob("gallery"),
  schema: z.object({
    title: z.string().max(120),
    lang: LANG,
    translationKey: z.string().optional(),
    date: z.coerce.date(),
    description: z.string().optional(),
    album: z.string(), // = folder name under src/assets/gallery/<album>/
    coverIndex: z.number().default(0),
  }),
});

// Legal docs are bilingual within one file (EN + VI sections); both locale routes
// render the same document. See docs 12_LEGAL.
const legal = defineCollection({
  loader: contentGlob("legal"),
  schema: z.object({
    title: z.string(),
    order: z.number().default(0),
    effectiveDate: z.string().optional(),
  }),
});

// The /now page (nownownow.com convention): what the owner is doing at the moment,
// refreshed every month or so. One file per locale, paired by translationKey.
// `updated` is required — a /now page with no visible date is worse than no /now page.
const now = defineCollection({
  loader: contentGlob("now"),
  schema: z.object({
    title: z.string(),
    lang: LANG,
    translationKey: z.string().optional(),
    updated: z.coerce.date(),
  }),
});

export const collections = { blog, stories, projects, faq, gallery, legal, now };
