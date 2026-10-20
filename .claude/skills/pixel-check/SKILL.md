---
name: pixel-check
description: Measure a rendered local or live page against Figma at every designed frame width with Playwright - matching elements through data-section and data-el, comparing font family, size, weight, line height, color, padding, gap, width, height, position, and radius - and save screenshots, overlays, and diffs. Report only; never edits code. Use for /pixel-check <url>, pixel-perfect review, design QA, or checking a section against Figma.
---

# pixel-check - measured design QA against Figma

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

Read-only. It reports differences; `/implement` or `/section` fixes them during
a build step, and `/fix` fixes them afterwards. It never edits app code,
`tokens.json`, or `map.json`.

## Input

- A URL: local (`http://localhost:3000/about`) or live
  (`https://my-site.vercel.app/about`)
- Optional `--section hero,header` to limit the check, `--widths 375,1440` to
  limit the widths (a partial run never satisfies the `/complete` gate)

## Prerequisites

- `blueprint/design/map.json` maps the page's sections and their `data-el`
  elements (written by `/figma` and `/section`).
- `node scripts/figma-extract.mjs check` passes.
- Playwright and Chromium are installed. If not, give the commands from
  `AGENTS.md` Required tools and stop. Never pass a check from reading code.
- The URL loads. For a local URL that refuses connections, ask the user to start
  the dev server; never start it yourself.

## Run

```text
node scripts/pixel-check.mjs <url> [--section a,b] [--widths 375,1440]
```

For each width in `map.json` the script sets the viewport to the frame width,
waits for fonts and images, disables animations, then for each mapped section:

1. measures the section root and every mapped `data-el` (boxes relative to the
   section, computed styles, colors as hex) and compares them with the Figma
   node values
2. screenshots the section and the Figma render at 1x and writes `figma.png`,
   `browser.png`, `overlay.png`, and `diff.png`

It writes `report.md` and `summary.json` to
`blueprint/reports/pixel/<date>/<time>-<page>/` and prints the verdicts.

## Tolerance

From `coding-standards.md`:

- 2px for position (x, y), size (width, height), padding, gap, font size, and
  line height; 0.5px for letter spacing
- exact for font family, font weight, color (alpha within 0.02), and radius
- padding and gap differences become notes when every position in that section
  matches, because the same layout can be built another way
- text wrapping that differs only because the real content differs from the
  Figma copy is not a defect; say so and recommend matching the content

## Report

Read `report.md` and view the overlays and diffs for every failing section, so
you can explain differences the numbers miss (alignment, wrapping, crop, wrong
icon, order). Present one table per width with the failing rows only:

| Element | Property | Figma | Browser | Diff | File to fix |
| --- | --- | --- | --- | --- | --- |
| `hero > title` | font-size | 64px | 60px | -4px | `components/sections/Hero/Hero.tsx` |

Then a verdict per width (`pass`, `fail (n differences)`, or
`unverifiable (reason)`), the report folder, and unmapped sections found on the
page. When a row's Figma value has no token, point to `tokens.json` instead of
the component.

## Gate rules

- `/complete` accepts only a run against the local app, with every designed
  width, whose `sourceHash` equals `node scripts/pixel-check.mjs fingerprint`
  now. Any later product change makes it stale. Live-site runs are useful
  evidence after a deploy, never the completion gate.
- Inside an active spec, a full pass is the evidence for a visual `Done when`.
  This skill never changes the spec status; `/check` does that.

After a failing run, offer `/fix` with the failing rows when no spec is active,
or hand the rows back to `/implement` when one is.

## Never

- Never edit code, tokens, the map, or content.
- Never report a pass without the script's measurements and screenshots.
- Never shorten the width list for a gate run.
