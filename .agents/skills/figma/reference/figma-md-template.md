# figma.md template

`/figma` writes `blueprint/context/figma.md` with these sections. Keep tables
compact; machine data lives in `tokens.json` and `map.json`, so do not copy
every value here.

```markdown
# Figma Design Map

## Source

- URL: <as given>
- File key: <key>, read <YYYY-MM-DD>
- Extraction method: <variables | MCP variables | styles | nodes>, with the
  reason (for example "Variables REST API 403: needs Enterprise; used named styles")
- Pages and frames in scope: <list>

## Breakpoints

| Key | Figma frame | Applies from | Notes |
| --- | --- | --- | --- |
| base | 375 | 0 | mobile |
| md | 768 | 768px | tablet |
| lg | 1440 | 1024px | desktop layout switch |

## Tokens

Summary of `blueprint/design/tokens.json`: main colors with roles, the type
scale per breakpoint, spacing, radii, shadows, container width, and the shadcn
mapping.

## Fonts

| Family | Weights | Loading |
| --- | --- | --- |
| Archivo | 600, 700 | next/font/google |

## Global parts

Header and footer: node per width, content (logo, nav items, CTA, socials),
and states (mobile menu).

## Pages

| Page | Route | Frames (width: node) | Sections in order |
| --- | --- | --- | --- |

## Section inventory

| Component | Type key | Role | Nodes (width: id) | Pages | Props (name: type) | Interactive part |
| --- | --- | --- | --- | --- | --- | --- |
| Hero | hero | page intro | 375: 12:345, 1440: 12:300 | home | title: string, text: string, image: Image, cta: Link | none |

## Shared components

Buttons, cards, badges, form fields: node IDs and the shadcn primitive behind
each interactive one.

## Collections

Candidates with fields, list and detail frames, and routes.

## Assets

| Asset | Node | Kind | Proposed path |
| --- | --- | --- | --- |
| Logo | 1:4 | svg component | components/icons/Logo.tsx |
| Hero photo | 12:370 | image | public/images/hero/hero-team-meeting.jpg |

## Interactions

Menus, sliders, accordions, hover and focus states, animation notes.

## Open questions

Missing frames, values that differ between frames, unclear states, licensed
fonts to provide.
```
