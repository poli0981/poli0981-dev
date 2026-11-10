## What and why

<!-- One or two sentences. Link the issue if there is one. -->

## Checks

- [ ] `npm run format:check`, `npm run lint`, `npm run check`, `npm run typecheck`, `npm test`
- [ ] `CHANGELOG.md` updated under `[Unreleased]` when visitors or operators would notice the change

## Accessibility (only if the interface changed)

See [`ACCESSIBILITY.md`](https://github.com/poli0981/poli0981-dev/blob/main/ACCESSIBILITY.md).
`npm run test:a11y` covers what a machine can check; the rest is by hand.

- [ ] Works with the keyboard alone, start to finish; focus is visible and never lands under a fixed bar
- [ ] Anything that opens (menu, dialog, panel) closes with Esc and hands focus back to what opened it
- [ ] Icon-only controls have a name that starts with their visible text, taken from `src/i18n`
- [ ] State and "you are here" are not shown by colour alone; new colours go through `tests/palette.test.ts`
- [ ] Headings do not skip a level; images have an `alt` (empty only when decorative)
- [ ] New animation has a still branch under `prefers-reduced-motion`
- [ ] Looked at 320 px wide, at 200% zoom, in dark and light, in Vietnamese and English
- [ ] Listened to once with a screen reader
