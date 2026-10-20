---
name: next-app
description: Feature 1 recipe for a figma-next-blueprint site - generate Figma tokens into Tailwind and shadcn variables, load fonts with next/font, build the root layout, header, footer, page renderer, content layer (typed files or Payload), base metadata, sitemap, and robots. Use for /next-app, the site foundation, or the first build-plan feature.
disable-model-invocation: true
---

# next-app - build the site foundation

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

**First action:** Before any other tool call, publish `running` to
`blueprint/.state/run.json` using the dashboard activity contract in `AGENTS.md`,
with command `next-app`.

Where this sits in the workflow:

    /figma  ->  /overview  ->  [next-app]  ->  /feature 2 ...
                               (feature 1: the foundation every
                                section and collection plugs into)

The site foundation is normally build-plan feature 1. This skill is its recipe.

## Mode

- **No active spec** (`current-feature.md` is the stub): run the `/feature` flow
  for the foundation build-plan item, using the build steps below as the spec's
  Build steps, filled with real values from `coding-standards.md` (content
  source, `src/`), `blueprint/context/figma.md`, `tokens.json`, and `map.json`.
  The Design reference lists the header and footer nodes at every width. Stop
  for spec approval, like `/feature`.
- **Active spec is the foundation**: this file is the recipe `/implement`
  follows. Implement through `/implement`, not here.
- **Foundation already exists** (`app/layout.tsx` has Figma fonts or the tokens
  block exists): never overwrite. Report what exists and propose only the
  missing pieces as a spec.

## Prerequisites

Stop and name the missing item when any is absent:

- `/onboard` finished: no `<content-source>` placeholder in `coding-standards.md`
- `blueprint/context/figma.md`, `blueprint/design/tokens.json`, and
  `blueprint/design/map.json` exist (run `/figma <url>` first)
- Tailwind v4 and shadcn are set up (`components.json`, `cn()` in `lib/utils.ts`)
- Playwright is installed for the pixel-check done-whens

## Build steps (spec template)

Templates for every file are in `reference/app-files.md`. Each step ends with
`npm run build` (or the Verify command) passing.

1. **Tokens and fonts** - run `node scripts/tokens-to-css.mjs` to add the
   generated block to `app/globals.css`; load every `tokens.json` font with
   `next/font` using its `variable`; root layout with `<html lang>` and the font
   variables, body classes `font-<body> text-<body> bg-background
   text-foreground antialiased`, and `<main id="main">`. Remove the
   create-next-app demo page content and its assets.
   *Done when:* `node scripts/tokens-to-css.mjs --check` passes, the build
   passes, and the browser shows the Figma fonts and colors.
2. **Payload install** (content source `payload` only) - with explicit approval
   for the exact command, install Payload into the app with the official
   installer, the chosen database adapter (Postgres by default), and
   `PAYLOAD_SECRET` plus `DATABASE_URI` in `.env` and their names in
   `.env.example`. Move the site layout under `app/(frontend)/`. Add a `pages`
   collection with `title`, `slug` (unique, indexed), `meta` (title,
   description, image), and an empty `layout` blocks field, plus a
   `site-settings` global for header and footer content. Public read access is
   explicit; everything else requires a logged-in user.
   *Done when:* `/admin` loads, a page can be created, and
   `payload generate:types` writes `payload-types.ts`.
3. **Content layer and page renderer** - `components/sections/registry.ts`,
   `components/PageRenderer.tsx`, `lib/content.ts`, and the catch-all route
   (`app/[[...slug]]/page.tsx`, or `app/(frontend)/[[...slug]]/page.tsx` for
   Payload) with `generateStaticParams`, `generateMetadata`, and `notFound()`.
   For content source `none`, also `content/types.ts`, `content/site.ts`, and
   `content/pages/home.ts` with an empty `sections` list.
   *Done when:* `/` renders the layout with no sections, an unknown slug returns
   the 404 page, and the build passes.
4. **Header** - `components/layout/Header.tsx` from the Figma header node at
   every width: logo (from `/assets` or a temporary text logo noted in the
   spec), navigation from site content, mobile menu as a `"use client"` leaf
   using shadcn `Sheet`, restyled with tokens. Root has
   `data-section="header"`; logo, nav, and menu button carry `data-el`. Update
   `map.json` elements. *Done when:* `/pixel-check` passes for `header` at
   every width and the menu opens with Enter, closes with Escape, and returns
   focus.
5. **Footer** - `components/layout/Footer.tsx` from the Figma footer node,
   content from site content, `data-section="footer"`, `data-el` on measured
   parts, `map.json` updated. *Done when:* `/pixel-check` passes for `footer`
   at every width.
6. **Metadata, sitemap, robots** - `lib/metadata.ts` (site URL from
   `NEXT_PUBLIC_SITE_URL`, added to `.env.example`), root `metadata` with
   `metadataBase`, `title.template`, default description, Open Graph, and
   Twitter card; `app/sitemap.ts` listing every page from the content layer;
   `app/robots.ts` pointing at the sitemap; `app/not-found.tsx` in the site
   design. *Done when:* `node scripts/seo.mjs site http://localhost:3000` has no
   errors and `seo.mjs check` on `/` reports no errors except the missing `h1`
   (expected until the first page feature).

## Rules

- Follow `blueprint/context/coding-standards.md`; it wins over the templates
  when they disagree.
- Header and footer belong to this feature; page sections do not. Sections are
  built later with `/section`.
- Never install a package without explicit approval for that exact command.
- Never hand-edit the generated tokens block; change `tokens.json` and rerun the
  script.
- Never start or stop the dev server; ask the user to run it for pixel-checks.

## Formatting

Format the output to match the project's conventions in
`blueprint/context/ai-interaction.md`.
