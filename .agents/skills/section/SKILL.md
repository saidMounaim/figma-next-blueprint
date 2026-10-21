---
name: section
description: Build one Figma section as a pixel-perfect Next.js Server Component - typed props, Tailwind token classes only, data-section and data-el hooks, a client leaf only when it needs interaction, a registry entry, content or a Payload block, and map.json elements - then run the pixel-check repair loop at every frame width. Use for /section <name or figma node url>, or when a build step creates or changes a page section.
---

# section - one Figma section, end to end

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

A recipe skill. Inside an active spec, `/implement` follows it for each section
step. Run directly with no active spec, it builds the section as direct work and
says that no spec is logging it; for planned work prefer `/feature` first.

## Input

A section name from the inventory in `blueprint/context/figma.md` (`Hero` or
`hero`), or a Figma node URL (`...?node-id=12-345`). With a URL, find the
matching inventory row and its nodes at the other widths in `map.json`; if the
section is not mapped yet, outline the parent frames to find them and add it.

## Prerequisites

- The site foundation exists (`components/sections/registry.ts`,
  `components/PageRenderer.tsx`, tokens block in `globals.css`). If not, run
  `/next-app` first.
- `node blueprint/scripts/figma-extract.mjs check` passes.

## Step 1 - read the design

For the section node at every designed width:

1. Make sure the render exists in `blueprint/reference/section-<type>-<width>.png`
   (render it with `figma-extract.mjs images ... --scale 1 --file ...` if not),
   then view it.
2. `node blueprint/scripts/figma-extract.mjs node <url>` and read the saved JSON:
   structure, text, `box` sizes and positions, auto-layout `gap` and `padding`,
   `font`, `fills`, `radius`, `effects`, and image fills (ratio = `w / h`). Use
   the Figma Dev Mode MCP design context too when available.
3. Map every value to a token from `blueprint/design/tokens.json`
   (`../figma/reference/tokens-json.md` lists the utilities). A value
   with no token is either a missing shared token (add it to `tokens.json`,
   rerun `node blueprint/scripts/tokens-to-css.mjs`, and note it in the step) or a
   genuinely one-off value (add a named token anyway; never an arbitrary class).

Check `components/sections/` first. An existing section with the same structure
means a variant (`tone`, `layout`) through `cva`, not a new component.

## Step 2 - props and content

1. Derive props from the design: every editable text, image, link, and repeated
   item becomes a prop; decoration stays in the component. Use the shared
   `Image` and `Link` types from `content/types.ts`.
2. **Content source `none`:** write `<Name>.types.ts`, add the type to
   `SectionMap` in `registry.ts`, and add the section with the real Figma copy
   to the page's file in `content/pages/`.
3. **Content source `payload`:** write `<Name>.block.ts` (slug = type key,
   fields matching the props, `required` only where the design breaks without
   it), add it to the `layout` blocks of `collections/Pages.ts`, run
   `payload generate:types`, and type the props from `payload-types.ts`. Tell
   the user which values to enter in `/admin` (or create the page content
   through the Local API seed in the spec when the spec includes one).

## Step 3 - the component

Write `components/sections/<Name>/<Name>.tsx` following
`reference/section-example.md`:

- Server Component. If part of it needs state or events, put only that part in
  `<Name><Part>.tsx` with `"use client"` and render it from the section.
- Root: `<section data-section="<type>" aria-labelledby=...>` (or the landmark
  the design implies). `data-el` on every element pixel-check measures: title,
  text, buttons, images, cards, list containers. Unique names within the
  section; repeated items share one name.
- Heading level from the page outline. Only a first section that carries the
  page title renders `h1`.
- Tailwind token classes only: no arbitrary values, no hex, no string-built
  class names. `cn()` and `cva` for variants.
- Mobile-first: unprefixed classes match the smallest frame, then `md:` and `lg:`.
  Responsive tokens (type, spacing) already switch on their own.
- Layout with Flexbox or Grid, gaps, and padding. Figma absolute positions are
  measurements, not CSS; never absolute-position layout.
- `next/image` for images with dimensions or `fill` plus `sizes`, alt from
  content, `priority` only for the above-the-fold hero. Icons from
  `components/icons/`.
- Interactive pieces use the matching shadcn primitive, restyled with tokens.
- Return `null` when required content is missing.

Register it in `registry.ts`. Add the section and its `data-el` names to
`blueprint/design/map.json` with the Figma node of each element at every width
(`../figma/reference/map-json.md`).

## Step 4 - verify

1. Run the Verify command from `AGENTS.md` (or typecheck and build).
2. Ask the user to start the dev server if it is not running.
3. Run `node blueprint/scripts/pixel-check.mjs <page-url> --section <type>`. Repair rows
   above tolerance and rerun. Stop after three rounds and report what still
   differs with the report path.
4. Confirm no console errors or hydration warnings on the page.

## Never

- Never write CSS files, inline styles (except a CSS variable from content),
  arbitrary values, or hex values for a section.
- Never edit the generated tokens block in `globals.css` by hand.
- Never mark a section done without a pixel-check pass at every width, unless
  the user accepts the listed differences in the current chat.
- Never duplicate a section that differs only by a variant.
