---
name: perf
description: Performance report for a local production build or live URL - Lighthouse mobile and desktop through npx with Playwright's Chromium - covering Core Web Vitals, the LCP element, image weight, fonts, and JavaScript, with each problem mapped to the Next.js file to fix. Report only; never edits code. Use for /perf <url>, performance review, Core Web Vitals, or pre-launch checks.
---

# perf - performance report

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

Read-only. It measures, explains, and offers a `/fix` spec. Lab numbers are a
guide; field data from the live site (Search Console, Vercel Speed Insights) is
the final word.

## Input

A URL. Measure a production build (`npm run build` then `npm run start`) or a
preview or live URL. The dev server is not representative; the script warns
when it detects it, and the report must repeat that warning.

## Prerequisites

Playwright with Chromium installed (its browser runs Lighthouse). Lighthouse
itself runs through `npx` with a pinned version and adds nothing to the
project. Network access is needed the first time `npx` fetches it.

## Run

```text
node blueprint/scripts/perf.mjs <url> [--form mobile,desktop]
```

It writes the Lighthouse JSON and `summary.json` to
`blueprint/reports/perf/<date>/<time>-<page>/` and prints category scores,
FCP, LCP, TBT, CLS, Speed Index, the LCP element, failing audits with their
resources, JavaScript transfer size with the largest scripts, fonts, and the
heaviest images.

## Map each problem to a file

Read the code (without editing) to name the exact owner:

| Problem | Usually fixed in |
| --- | --- |
| LCP image slow or late | the section's `next/image`: `priority` on the hero, correct `sizes`, export size from `/assets` |
| Oversized or unsized images, layout shift | `next/image` `width`/`height` or `fill` plus `sizes`; images in `public/images/` |
| Render-blocking or slow fonts | `next/font` in `app/layout.tsx`: only the weights in `tokens.json`, `display: "swap"` |
| Large or unused JavaScript | `"use client"` boundaries: move them down to the interactive leaf; heavy libraries imported in client components |
| Long main-thread tasks | client components doing work on load, third-party scripts (load with `next/script` and a lazy strategy) |
| Slow server response | `force-dynamic` or uncached fetches on static content; Payload queries without `limit` or with deep `depth` |

## Report

Write `blueprint/reports/perf/<date>/report.md` with:

1. a table: Form | Performance | Accessibility | Best practices | SEO
2. a Core Web Vitals table per form with pass (good), needs improvement, or poor
   using Google's thresholds (LCP 2.5s / 4s, CLS 0.1 / 0.25, TBT as the lab proxy
   for INP: 200ms / 600ms)
3. the top problems in priority order: Problem | Evidence | Savings | Fix in
4. warnings (dev server, local network)

Then offer a `/fix` spec for the top problems.

## Never

- Never edit code, config, or content.
- Never present dev-server numbers as production performance.
