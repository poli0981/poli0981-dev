# Accessibility

How accessibility is handled on [poli0981.dev](https://poli0981.dev): what the site aims for, what is
in place, how it is tested, what is known not to work, and how to report a barrier.

The statement written for visitors, in English and Vietnamese, is on the site at
[`/legal/accessibility`](https://poli0981.dev/legal/accessibility/) (and
[`/en/legal/accessibility`](https://poli0981.dev/en/legal/accessibility/)). This file is the
repository's copy, with the notes for people who work on the code — if the two ever disagree about
what a visitor can expect, the site wins.

> Tiếng Việt: tuyên bố trợ năng dành cho khách truy cập nằm ở
> [`/legal/accessibility`](https://poli0981.dev/legal/accessibility/). Gặp rào cản? Gửi email tới
> **accessibility@poli0981.dev** hoặc dùng nút "Báo lỗi" ở cuối mọi trang.

## Reporting a barrier

Email **accessibility@poli0981.dev**, or use **Report a bug** at the bottom of every page — it needs
no account and lands in a private tracker. If you use GitHub, you can open an issue with the
[Accessibility template](https://github.com/poli0981/poli0981-dev/issues/new?template=accessibility.yml).

It helps to say which page, what you were trying to do, what happened instead, and which browser and
assistive technology you use. You do not have to diagnose anything, and you never need to tell me
about a disability.

Expect a reply within 7 days. Reports are handled in this order:

- **Critical** — blocks a core task (reading a page, moving around the site, reporting a problem)
- **Serious** — major difficulty, but there is another way to do it
- **Moderate** — annoying or inconsistent
- **Minor** — little impact

This is a personal site maintained by one person, in their spare time, so there is no fixed date for
every fix. You will be told what is planned, and a workaround if there is one.

## Target

[WCAG 2.2](https://www.w3.org/TR/WCAG22/) Level AA, used as the guide for design and review. The site
has not been audited by a third party, and this is not a claim of conformance.

## What is in place

- **Keyboard.** Every page works with the keyboard alone. There is a skip link
  (`src/components/SkipLink.astro`) and one focus ring for everything (`src/styles/global.css`). The
  menu sheet, the search and the photo viewer trap focus while open, close with Esc and hand focus
  back to what opened them; the report form is a native `<dialog>`. `/` opens the search. The
  page's scroll padding keeps whatever takes focus clear of the sticky header, the mobile tab bar
  and the legal notice.
- **Screen readers.** Each page declares its language, and text in the other language carries its
  own: the language switch, and each half of a legal page, which holds both languages
  (`src/lib/legal-lang.ts`). There is one `<h1>` per page and heading levels do not skip. Every `<nav>` has its own name, taken
  from `src/i18n`. Icon-only controls are named, and a name starts with the text that is visible
  (WCAG 2.5.3). The search is an ARIA combobox. Live regions announce search results, the photo
  viewer's position and caption, and the report form's status.
- **Colour and contrast.** In both palettes, text is at least 4.5:1 on every surface it sits on,
  and the line colour used where a boundary has to be seen is at least 3:1;
  `tests/palette.test.ts` fails the build if one drops below. Decorative hairlines are fainter.
  The current page and a chosen option are never shown by colour alone. Windows High Contrast (`forced-colors`) and
  `prefers-contrast: more` are handled.
- **Motion.** One global rule collapses every animation under `prefers-reduced-motion`, and
  scripted motion follows it (`src/lib/motion.ts`). Nothing loops or plays by itself; a YouTube
  video loads only after its play button is pressed.
- **Zoom and reflow.** Type is fluid and in `rem`, zooming is never locked, and pages reflow down
  to a 320 px viewport.
- **Touch.** The tab bar's targets are 56 px tall, the header's controls 40 px and the footer's
  icons 44 px. Text links in the footer and the sidebars are about 24 px tall or less and meet
  WCAG 2.5.8 through the space around them.
- **Reading.** Stories have their own settings: three text sizes and a paper, sepia or dark
  background.

## Tested with

| How              | What                                                               |
| ---------------- | ------------------------------------------------------------------ |
| Keyboard only    | Chrome, Edge and Brave on Windows 11                               |
| Windows Narrator | Edge, Chrome and Brave on Windows 11                               |
| VoiceOver        | Safari on iPhone                                                   |
| Automated        | axe-core in Chrome, on every pull request (see "For contributors") |

Not yet tested by the maintainer: NVDA, JAWS, TalkBack, VoiceOver on macOS, and voice control. They
are expected to work; a report saying otherwise is welcome.

The site supports the current versions of Chrome, Edge, Firefox and Safari, on desktop and mobile.

## Known limitations

- **Bot check.** A first visit passes through a Cloudflare Turnstile check. It usually needs no
  action, but it is a third-party component this repository cannot change. Anyone it stops can
  write to the address above.
- **Videos.** Videos are YouTube embeds. Captions are whatever YouTube provides for each video;
  there are no transcripts.
- **Older images.** Gallery photos must have a caption in both languages (the build fails
  otherwise). A few images inside older posts may still lack a text alternative.
- **Offline mini-game.** The game on the offline page is drawn on a canvas. It can be played with
  the Space key, but a screen reader cannot follow it. It is an extra, not content.
- **Search** needs JavaScript. Without it, every page is still reachable from the menu and the
  footer links.
- **The admin** (`admin.poli0981.dev`) is a single-owner tool and is not covered by this document.
- **Automated checks run in Chrome only**, and no tool can judge everything: a passing run is
  necessary, not sufficient. The live widgets (latest video, now playing) have no data in the
  test build, so their markup is checked by hand.

## For contributors

A change to the interface is expected to keep all of this true:

- It works with the keyboard alone, start to finish; focus is visible and never lands under a fixed bar.
- Anything that opens closes with Esc and hands focus back to what opened it.
- Icon-only controls have a name that starts with their visible text, taken from `src/i18n`.
- State and "you are here" are not shown by colour alone. A new colour goes into
  `src/lib/palette.ts` and `src/styles/global.css` together, where the palette test checks it.
- Headings do not skip a level; images have an `alt`, empty only when they are decorative.
- New animation has a still branch under `prefers-reduced-motion`.
- It has been looked at 320 px wide, at 200% zoom, in dark and light, in Vietnamese and English,
  and listened to once with a screen reader.

What the pipeline checks:

- **`npm run test:a11y`** runs in the required `build` check, so a pull request with a violation
  cannot be merged. It scans every page listed in the build's sitemap with axe-core (WCAG 2.2 A and
  AA rules plus axe's best practices), a page of each template again in the light theme and at
  phone width, and the menu, search, photo viewer, report dialog, reading settings and legal notice
  while they are open. It then walks the keyboard contract — the skip link, focus traps, Esc and
  focus return, focus not hidden under a bar in either direction — checks that no page scrolls
  sideways at 320 px (and a sample at 360 and 390 px), and checks the forced-colours rules. The
  tests are in `tests/a11y/`.
- **`tests/palette.test.ts`** checks the text and line colours of both palettes against AA.
- **Lighthouse** reports an accessibility score on pull requests; it is advisory.

To run the suite locally, build and serve the site, then run it from a second terminal:

```bash
npm run build
```

```bash
npm run preview
```

```bash
npm run test:a11y
```

It drives the Chrome that is already installed; set `A11Y_CHANNEL=msedge` to use Edge instead. If a
rule cannot be met, say why in the pull request rather than switching the rule off.

## Ownership and review

Maintained by Kokone ([poli0981](https://github.com/poli0981)), the site's only maintainer, who
triages reports and keeps this file and the site's statement in step. Both are reviewed with every
release that changes the interface and at least once a year
([`17_MAINTENANCE.md`](poli0981.dev-docs/17_MAINTENANCE.md)).

Last reviewed: 2026-11-10 (v2.2.0).
