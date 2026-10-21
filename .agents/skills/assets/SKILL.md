---
name: assets
description: Export images and icons from Figma at the right sizes - photos and illustrations into public/images/<section>/ with descriptive file names, icons and logos into components/icons/ as React SVG components using currentColor. Use for /assets, exporting Figma images, icons, or logos, or when a build step needs design assets.
---

# assets - export images and icons from Figma

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

A recipe skill. `/implement` follows it when a step needs assets; run directly,
it exports the requested assets as direct work and says no spec is logging it.

## Input

None (export everything listed under Assets in `blueprint/context/figma.md`
that does not exist yet), a section name (`/assets hero`), or Figma node URLs.

## Step 1 - plan the export

Build one table and show it before writing anything:

| Asset | Node | Kind | Format and scale | Path |
| --- | --- | --- | --- | --- |
| Logo | 1:4 | icon component | svg | `components/icons/Logo.tsx` |
| Arrow right | 3:12 | icon component | svg | `components/icons/ArrowRight.tsx` |
| Hero photo | 12:370 | image | jpg, 2x of the largest rendered size | `public/images/hero/hero-team-meeting.jpg` |

- **Names** describe the content (`hero-team-meeting.jpg`, `ArrowRight.tsx`),
  never node IDs or layer names like `Rectangle 12`.
- **Icons and logos** (vector, single or few colors) become components.
- **Photos** use `jpg`; illustrations with transparency use `png`. Export at 2x
  of the largest size the design renders them; `next/image` serves smaller
  sizes. Use `figma-extract.mjs fills` instead of a render when the original
  photo is needed without the Figma crop.
- List any existing file the export would replace and ask before replacing it.

## Step 2 - export

```text
node blueprint/scripts/figma-extract.mjs export <url> --ids 1:4,3:12 --names Logo,ArrowRight --format svg --component --out components/icons
node blueprint/scripts/figma-extract.mjs export <url> --ids 12:370 --names hero-team-meeting --format jpg --scale 2 --out public/images/hero
```

The `--component` export prefixes SVG ids per icon, turns single-color fills
into `currentColor`, sets `aria-hidden` by default, and accepts a `title` prop
for meaningful icons.

## Step 3 - check

- Open each icon component: multi-color logos keep their colors; any remaining
  hex inside an icon is allowed only when the logo needs it. Remove fixed
  `width`/`height` when the icon must scale with text (use `size-*` classes).
- Run the typecheck. Record the new paths in the Assets table of `figma.md`.
- Images feed content (`content/` files or the Payload media library); give the
  user the alt text for each one, describing what the image shows.

## Never

- Never overwrite an existing asset without listing it and getting a yes.
- Never export fonts; fonts come from `next/font`.
- Never name a file after a node ID.
