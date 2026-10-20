---
name: a11y
description: Accessibility report for a local or live page - axe-core (WCAG 2.2 A and AA plus best practices) through Playwright at every designed breakpoint, plus a keyboard pass for tab order, visible focus, focus traps, and menu or dialog toggles - with each issue mapped to the file to fix. Report only; never edits code. Use for /a11y <url>, accessibility review, or pre-launch checks.
---

# a11y - accessibility report

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

Read-only. It finds problems and where to fix them, then offers a `/fix` spec.
Automated checks catch part of WCAG; say so in every report.

## Input

A URL, local or live. Optional `--widths` (default: the widths in
`blueprint/design/map.json`).

## Prerequisites

Playwright with Chromium and `axe-core` installed as devDependencies. If either
is missing, give the commands from `AGENTS.md` Required tools and stop. For a
local URL that refuses connections, ask the user to start the app.

## Run

```text
node scripts/a11y.mjs <url> [--widths 375,768,1440]
```

The script runs axe at each width, then a keyboard pass at the smallest and
largest width: it tabs through the page (focus order, hidden focusable
elements, missing focus styles, traps) and presses Enter and Escape on visible
`aria-expanded` toggles (opens, closes, focus returns). It writes
`results.json` to `blueprint/reports/a11y/<date>/<time>-<page>/`.

## Map each issue to a file

Each node carries its nearest `data-section` and `data-el`; `map.json` gives the
component. Read the component to name the exact line. Typical fixes:

| Issue | Usually fixed in |
| --- | --- |
| `color-contrast` | the token pair in `tokens.json`; contrast from Figma is used as-is, so report it as a design question for the user rather than changing a color silently |
| `image-alt`, `link-name`, `button-name` | the component (`aria-label`, alt from content) or the content entry |
| `heading-order`, `page-has-heading-one` | section heading levels |
| `region`, `landmark-*` | `app/layout.tsx` and section roots |
| `label`, form errors | the form component and its zod error wiring |
| focus indicator | the component classes (`focus-visible:ring-*` with the `ring` token) |
| toggle Escape or focus return | the client leaf; prefer the shadcn primitive's built-in behavior |

## Report

Write `blueprint/reports/a11y/<date>/report.md` with:

1. a summary table: Width | Critical | Serious | Moderate | Minor | Keyboard issues
2. one table per rule: Impact | Rule | Elements | Where (section > element) | Fix in
3. the keyboard pass: tab stop count, order notes, and issues
4. what automation cannot judge (meaningful alt text, reading order sense,
   captions) as a short manual checklist

Verdict: `fail` with any critical or serious violation or keyboard issue,
otherwise `pass with notes` or `pass`. Then offer a `/fix` spec.

## Never

- Never edit code, tokens, or content.
- Never claim WCAG conformance from an automated pass.
