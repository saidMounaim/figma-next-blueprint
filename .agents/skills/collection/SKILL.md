---
name: collection
description: Build repeated content (posts, projects, team, services) from Figma as typed content files or a Payload collection, with list and detail routes, generateStaticParams, generateMetadata, a card component, sitemap entries, and pixel-checked list and detail pages. Use for /collection <name>, adding a content type, or when a build step needs list and detail pages.
---

# collection - repeated content with list and detail routes

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

A recipe skill. Inside an active spec, `/implement` follows it for collection
steps. Run directly with no active spec, it does the work as direct work and
says no spec is logging it; for planned work prefer `/feature` first.

## Input

A collection name, plural (`/collection projects`), optionally with Figma node
URLs for the card, list page, and detail page. Fall back to the Collections
section of `blueprint/context/figma.md`.

## Decide before writing

Confirm from the plan or design, and ask only when missing:

- slug and route (`projects` -> `/projects` and `/projects/[slug]`), or
  list-only content shown inside sections (testimonials) with no routes
- fields visible on the card and the detail page, with types
- ordering, filtering (only when the design shows it), and pagination size
- which sections elsewhere list items from it

## Steps

1. **Data**
   - Content source `none`: `content/<collection>/types.ts` with the item type
     (including `slug` and `meta`), one file per item in
     `content/<collection>/<slug>.ts` with the Figma copy, and an index that
     exports the array. Getters in `lib/content.ts`: `get<Items>()`,
     `get<Item>(slug)`.
   - Content source `payload`: `collections/<Name>.ts` with explicit `access`
     (public read; create, update, delete for logged-in users), a unique
     indexed `slug`, `meta` group, and the fields; register it in
     `payload.config.ts`; run `payload generate:types`. Getters use the Local
     API with `limit`, `depth`, and `select`, never a query per card.
2. **Card** - `components/<collection>/<Item>Card.tsx` from the Figma card node:
   Server Component, token classes only, `data-el` on measured parts,
   `next/image`, the whole card linked with one `<a>` (no nested links).
3. **List route** - `app/<collection>/page.tsx` (under `(frontend)` for
   Payload): one getter call, the card grid, static `metadata` or
   `generateMetadata`, and pagination when the design shows it. Its sections
   carry `data-section` like any page.
4. **Detail route** - `app/<collection>/[slug]/page.tsx` with
   `generateStaticParams` from the getter, `generateMetadata` through
   `pageMetadata()`, and `notFound()` for unknown slugs. JSON-LD (for example
   `Article`) only when the plan asks for it, built with `JSON.stringify`.
5. **Sitemap** - add every list and detail URL to `app/sitemap.ts` from the
   same getters.
6. **Sections that list items** (for example "latest projects") call the getter
   once with an explicit limit and pass items down.
7. **Map and verify** - add the list and detail designs to
   `blueprint/design/map.json` (`pages` with a sample detail route and
   `template: true`, sections with `data-el` elements), run Verify, then
   `/pixel-check` on the list page and one detail page at every width.

## Never

- Never fetch inside a card, a `map`, or once per item.
- Never rename a slug or field that already has content without the user's
  explicit decision and a migration step in the spec.
- Never leave a Payload collection without explicit `access`.
- Never invent items; use the Figma copy and say how many sample items exist.
