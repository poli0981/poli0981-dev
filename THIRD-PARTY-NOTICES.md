# Third-Party Notices

This site is built with open-source software. Each component below remains under its own license;
the full license texts ship inside each package under `node_modules/`.

The short version of this file is rendered on the site at
[`/legal/third-party`](https://poli0981.dev/legal/third-party/).

Licenses are read from each package's own `package.json` as installed. This list is maintained by
hand for now — `scripts/gen-notices.mjs` (docs 08 §6) will generate and CI-verify it later.

## Ships to the browser

Only these end up in what a visitor downloads.

| Package                                                                                   | License     |
| ----------------------------------------------------------------------------------------- | ----------- |
| astro, @astrojs/cloudflare, @astrojs/mdx, @astrojs/rss, @astrojs/sitemap, @astrojs/svelte | MIT         |
| svelte                                                                                    | MIT         |
| tailwindcss, @tailwindcss/vite                                                            | MIT         |
| pagefind                                                                                  | MIT         |
| zod                                                                                       | MIT         |
| Bricolage Grotesque, Be Vietnam Pro, Literata, JetBrains Mono                             | SIL OFL 1.1 |

## Build-time only

Never served to visitors; used to produce the site.

| Package                                                              | License           |
| -------------------------------------------------------------------- | ----------------- |
| sharp                                                                | Apache-2.0        |
| satori                                                               | MPL-2.0           |
| satori-html                                                          | MIT               |
| @resvg/resvg-js                                                      | MPL-2.0           |
| gray-matter                                                          | MIT               |
| exifr                                                                | MIT               |
| wrangler                                                             | MIT OR Apache-2.0 |
| typescript                                                           | Apache-2.0        |
| @astrojs/check                                                       | MIT               |
| eslint, eslint-plugin-astro, eslint-plugin-svelte, typescript-eslint | MIT               |
| prettier + prettier-plugin-astro / -svelte / -tailwindcss            | MIT               |
| knip                                                                 | ISC               |
| lefthook                                                             | MIT               |
| @types/node                                                          | MIT               |

MPL-2.0 (satori, @resvg/resvg-js) is file-level copyleft. Both are used unmodified as build
tools, so no source-disclosure obligation is triggered.

## Infrastructure services

Not packages — listed for transparency: Cloudflare (hosting, CDN, Turnstile), GitHub (source,
issues), and the public YouTube / Steam / GitHub data APIs used by the widgets worker.

## AI tooling

The models used to write this site's code are disclosed separately at
[`/legal/ai-usage`](https://poli0981.dev/legal/ai-usage/).
