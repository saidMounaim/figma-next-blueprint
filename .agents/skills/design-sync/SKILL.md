---
name: design-sync
description: Re-read the Figma file and report what changed since the last sync - tokens, sections, text, sizes, added or removed nodes - mapped to the affected components and pages, then propose /fix specs. Report only; never edits code or design files without approval. Use for /design-sync, checking for design updates, or "did the Figma change?".
---

# design-sync - what changed in Figma

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

Read-only on app code. It compares the live Figma file with the baseline in
`blueprint/design/snapshot.json`, explains the changes in project terms, and
proposes `/fix` specs. The baseline moves only after the user approves.

## Input

None (use the frames recorded in `blueprint/design/map.json` `pages`), or a
Figma URL to limit the check to one page or frame.

## Steps

1. Preflight: `blueprint/design/snapshot.json` and `map.json` exist (otherwise
   run `/figma` first) and `node blueprint/scripts/figma-extract.mjs check` passes.
2. Take a fresh snapshot of the same frames, bypassing the cache:
   `node blueprint/scripts/figma-extract.mjs snapshot <frame-urls...> --out blueprint/.state/figma/snapshot-new.json --no-cache`
3. Compare: `node blueprint/scripts/figma-extract.mjs diff blueprint/design/snapshot.json blueprint/.state/figma/snapshot-new.json`
4. Also rerun `tokens` with `--no-cache` and compare its colors, text styles,
   spacing, radii, and shadows with `blueprint/design/tokens.json`.
5. Map every change to code: a node inside a mapped section belongs to that
   section's component (`map.json`); a changed token belongs to `tokens.json`;
   new top-level frames or sections are new scope; removed nodes may leave dead
   `data-el` hooks or content fields.

## Report

Lead with a one-line verdict: no changes, cosmetic changes, or changes that need
work. Then one table:

| Area | Change | Figma before | Figma after | Affects | Proposed action |
| --- | --- | --- | --- | --- | --- |
| Token `brand` | color | #1D4F91 | #1A4A8A | every `bg-brand`, shadcn `primary` | `/fix` update tokens.json and regenerate |
| Hero > title | text | "Build faster" | "Ship faster" | `content/pages/home.ts` | content edit |
| Services | new card | - | node 14:220 | `ServicesGrid` | `/fix` or a `/feature` if it adds scope |

Group the proposals into the smallest set of `/fix` specs (one per component or
token change) and flag anything that is new scope for `/feature` instead. Text
changes are content edits (content files or the Payload admin), not code.

Finally ask whether to accept the new snapshot as the baseline. Only on an
explicit yes, copy `snapshot-new.json` over `blueprint/design/snapshot.json`
and say that `tokens.json` and `map.json` change only through the proposed
fixes.

## Never

- Never edit app code, `tokens.json`, `map.json`, `globals.css`, or content.
- Never move the baseline without an explicit yes.
- Never start a `/fix` automatically; propose it.
