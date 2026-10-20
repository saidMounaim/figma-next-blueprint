# Build Plan

List the features in rough build order, one line each. `/figma` proposes this
list from the design; edit it freely. When both planning docs are ready, run
`/overview`. It adds tracking numbers and checkboxes before generating the
project overview.

Run `/feature` to spec the next unchecked item, or `/feature 2` to pick one.
Keep completed items checked and append new features as the project grows.
Do not renumber completed features; their archived specs refer to those IDs.

A typical order:

1. Site foundation: tokens, fonts, layout, header, footer, page renderer, metadata (`/next-app`)
2. One feature per page, building only its new sections (`/section`)
3. One feature per collection, with list and detail routes (`/collection`)
4. Forms, global interactions, and final responsive polish
5. Launch readiness: `/seo --all`, `/a11y`, `/perf`, then `/release`

## Your features

Replace these examples with your own features:

- [ ] 1. **Site foundation** - Figma tokens, fonts, root layout, header, footer, page renderer, base metadata, sitemap, robots
- [ ] 2. **Home page** - hero, services, testimonials, CTA sections
- [ ] 3. **Projects collection** - project list and detail pages
