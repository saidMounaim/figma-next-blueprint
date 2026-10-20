---
name: seo
description: Check local or live pages for on-page SEO problems - title and description presence, length, and uniqueness, canonical, Open Graph and Twitter tags, a single h1 and heading order, image alt text, broken internal links, sitemap.xml and robots.txt, JSON-LD validity, lang, and noindex left on - map each issue to the Next.js file to fix, and write a report. Report only; never edits code. Use for /seo <url> [--all], SEO review, or pre-launch checks.
---

# seo - on-page SEO report

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

Read-only. It checks what crawlers read in the rendered HTML and reports where
each problem is fixed. It never edits code or content; it offers a `/fix` spec.
It does not measure rankings, keywords, backlinks, or speed (use `/perf`).

## Input

- `/seo <url>` - one page (local or live)
- `/seo <url> --all` - crawl internal links and sitemap URLs from that page,
  respecting `robots.txt`, up to 50 pages (`--limit N` to change)

For a launch check, run it against a production build (`npm run build` then
`npm run start`) or the preview URL, because the dev server can differ.

## Run

```text
node scripts/seo.mjs site <origin>
node scripts/seo.mjs check <url> --links          # one page
node scripts/seo.mjs crawl <url> --limit 50 --links   # --all
```

The script sends only GET and HEAD requests with a crawler user agent, so
Next.js renders metadata the way search engines receive it. Local sitemaps that
point at the production domain are mapped back to the local origin.

## Checks

| Severity | Checks |
| --- | --- |
| error | HTTP status, missing or multiple `<title>`, `noindex`, missing `lang` or viewport, missing, multiple, or empty `h1`, image without `alt`, multiple canonicals, invalid JSON-LD, broken internal link, missing or invalid sitemap, `Disallow: /` |
| warning | title outside 30-60 characters, missing description or outside 70-160, missing or foreign canonical, `nofollow`, skipped heading level, missing Open Graph or Twitter tags, image without dimensions, placeholder or empty links, redirects, duplicate titles or descriptions, JSON-LD without `@context` or `@type`, robots.txt without a Sitemap line |
| info | empty `alt` (correct only for decoration), no structured data, no favicon, lazy first image, internal `nofollow`, sitemap URLs on another origin |

`noindex` on a local or preview build is often intentional; report it as a
**launch blocker** to fix before production, not as a local defect.

## Map each issue to a file

Read the code (without editing) to name the exact file. Typical owners:

| Problem | Fix in |
| --- | --- |
| Title, description, canonical, Open Graph, Twitter | `generateMetadata` or `metadata` in the route's `page.tsx`; defaults, `title.template`, and `metadataBase` in `app/layout.tsx` via `lib/metadata.ts` |
| Duplicate titles or descriptions | each route's metadata, or content `meta` fields (content files or Payload) |
| Sitemap missing pages | `app/sitemap.ts` and the content getters it uses |
| robots.txt, sitemap link | `app/robots.ts` |
| `lang`, viewport | `app/layout.tsx` |
| Missing or extra `h1`, heading order | the section components in `components/sections/` |
| Image alt or dimensions | `next/image` props in the component, or alt text in content |
| Broken or placeholder links | the component or the content entry that renders them |
| JSON-LD | the script that builds it (layout or route) |

## Report

Write `blueprint/reports/seo/<date>.md` (append `-2`, `-3` for more runs that
day) with:

1. a summary table: Page | Errors | Warnings | Info | Verdict
2. site-wide findings, including launch blockers
3. one table per page with problems: Severity | Check | Found | Expected | Fix in
4. duplicates and broken links with the pages that contain them
5. **Fix first**: up to five actions in priority order, each marked **code** or
   **content**

Verdict per page: `pass`, `pass with warnings`, or `fail (n errors)`. Group
repeated findings into one row with a count. Never report a pass for a page
that did not load. Wording suggestions for titles and descriptions are labeled
as suggestions and use only facts from the page.

Then offer a `/fix` spec for the code problems.

## Never

- Never edit code, content, or settings.
- Never crawl another origin or ignore `robots.txt`.
