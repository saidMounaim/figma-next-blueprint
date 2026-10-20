---
name: figma
description: Read a Figma URL (design, file, proto, or board link, with or without node-id) and extract colors, typography, spacing, radii, shadows, breakpoints, fonts, sections per page, collection candidates, and assets into blueprint/context/figma.md, blueprint/design/tokens.json, and blueprint/design/map.json, then propose plan drafts for approval. Use for /figma <url>, design intake, extracting tokens, or mapping a Figma design to Next.js sections. Never writes app code.
disable-model-invocation: true
---

# figma - turn a Figma URL into a Next.js build map

**Context reuse:** Reuse any required file already loaded in project instructions or the current session. Read it again only if absent, changed, or exact current bytes or line references are needed.

**First action:** Before any other tool call, publish `running` to
`blueprint/.state/run.json` using the dashboard activity contract in `AGENTS.md`,
with command `figma`.

Where this sits in the workflow:

    /onboard  ->  [figma <url>]  ->  review plans  ->  /overview  ->  /next-app
                  (figma.md, tokens.json, map.json,
                   reference renders, plan drafts)

This skill reads the design and writes the design map. It never writes app code,
never edits `app/globals.css`, and never installs anything. Its outputs:

- `blueprint/context/figma.md` - the readable design map with node IDs, using
  `reference/figma-md-template.md`; keep it under 20,000 bytes
- `blueprint/design/tokens.json` - curated tokens, schema in
  `reference/tokens-json.md`
- `blueprint/design/map.json` - pages and sections with node IDs per frame width,
  schema in `reference/map-json.md` (elements are added later by `/section`)
- `blueprint/design/snapshot.json` - the `/design-sync` baseline
- `blueprint/reference/*.png` - 1x renders of every in-scope page frame and section
- proposed edits to `blueprint/project-plan.md` and `blueprint/build-plan.md`,
  written only after approval

## Reading the design

Two readers exist. Use both when available:

- **Figma Dev Mode MCP server** (when the session exposes Figma MCP tools such as
  metadata, variable definitions, screenshots, or design context). Prefer it for
  understanding structure and for named variables and styles: its variable
  definitions work on every Figma plan. Record what it returned.
- **`scripts/figma-extract.mjs`** (REST API, needs `FIGMA_TOKEN`). Always use it
  for the files other scripts depend on: renders, `tokens-raw.json`, node JSON,
  and `snapshot.json`.

```text
node scripts/figma-extract.mjs check
node scripts/figma-extract.mjs outline <url> --depth 2
node scripts/figma-extract.mjs node <url>
node scripts/figma-extract.mjs tokens <frame-url> [<frame-url> ...]
node scripts/figma-extract.mjs images <url> --ids 1:2 --file blueprint/reference/page-home-1440.png
node scripts/figma-extract.mjs snapshot <frame-url> [...] --out blueprint/design/snapshot.json
```

If `check` fails, stop and give the token setup from `AGENTS.md` Required tools.
Never print, echo, or ask for the token. A 403 on a file means the token owner
cannot view it; a 403 only on `/me` means the token lacks `current_user:read`
but may still read files, so try `outline` before stopping.

## Input

A Figma URL. Accept `figma.com/design`, `file`, `proto`, and `board` links,
with or without `node-id` (a `proto` link's node is its starting frame). With no
node, list pages and top-level frames from `outline` and ask which are in scope.
A second run with another URL adds to the existing map instead of replacing it;
show what changes before overwriting any existing value.

## Step 1 - map the structure

1. `outline <url> --depth 2`. For a single frame, also outline its parent page
   (the URL without `node-id`) to find sibling frames for other widths and pages.
2. Group frames by page and width. The frame width is the design width
   (`Home - 1440`, `Home - 375`). Record every designed width. A page that lacks
   a width the others have goes to Open questions.
3. For each in-scope page frame, `outline <frame-url> --depth 3`. Direct children
   that span the frame width and stack vertically are **sections**. Name each by
   role in PascalCase (`Hero`, `ServicesGrid`, `Testimonials`) with a kebab-case
   type key (`hero`, `services-grid`). Never use layer names like `Frame 427`.
4. Detect **repeats**: the same section on several pages becomes one component;
   repeated components (`INSTANCE` nodes of one component: cards, buttons,
   badges) become shared pieces or shadcn-backed primitives.
5. Detect **collection candidates**: repeated content items with their own
   detail page or listing (posts, projects, team, services). Note visible fields.
6. Detect **global parts**: header, footer, navigation, and their states at each
   width (desktop nav vs mobile menu button).
7. Detect **interactions** a static frame implies: menus, sliders, accordions,
   tabs, modals, filters, forms. Prototype links are not exposed by the API; ask
   the user or note them as Open questions.

## Step 2 - extract tokens

1. Run `tokens` with one URL per breakpoint frame of the main page (or the page
   URL). Read `blueprint/.state/figma/tokens-raw.json`.
2. Record the extraction **method** from its `method` and `variablesApi` fields:
   `variables` (Figma Variables, Enterprise only through REST), `styles` (named
   color, text, and effect styles), or `nodes` (raw values). When the Variables
   API is unavailable, say so plainly and say which fallback was used; when the
   MCP returned variable definitions, use those names and record "MCP variables".
3. Curate `blueprint/design/tokens.json` following `reference/tokens-json.md`:
   - colors named by role (`brand`, `ink`, `paper`, `line`), never shadcn names
     (`primary`, `background`, `border`, ...); map those through `shadcn`
   - one `font` entry per family with weights actually used and its source
     (`google` or `local`)
   - text styles by role (`display`, `h1`, `h2`, `body`, `small`, `eyebrow`) with
     responsive values keyed by breakpoint when frames differ
   - spacing values that repeat (section padding, gutters, card gaps), radii,
     shadows, and the container width (content width at the widest frame)
   - breakpoints from the frames: base = smallest frame, `md` = tablet frame
     (`minWidth` = its width), `lg` = desktop switch at `minWidth: 1024` unless a
     frame defines another switch point, plus any extra frame
   - prefer values that repeat; one-off values stay out and become section-local
     decisions during `/section`
4. Never invent or average a value. When the same role differs between frames
   without a clear breakpoint, list both under Open questions.

## Step 3 - fonts and assets

- List each family and weight with its loading plan: `next/font/google` when it
  is a Google Font, `next/font/local` when the user must provide licensed files
  (ask for them; never download fonts from elsewhere).
- List logos, icons, and photos with node IDs and proposed descriptive names in
  figma.md. `/assets` exports them later; do not export here.

## Step 4 - reference renders and map.json

1. Render every in-scope page frame and section node at 1x:
   `images <url> --ids <id> --scale 1 --file blueprint/reference/page-<page>-<width>.png`
   and `section-<type>-<width>.png`. View them to confirm the section split.
2. Write `blueprint/design/map.json` with `fileKey`, `widths`, `pages` (route and
   frame per width), and `sections` (component path, node per width, pages,
   `global` for header and footer, empty `elements`).
3. Save the baseline: `snapshot <frame-urls...> --out blueprint/design/snapshot.json`.

## Step 5 - write figma.md

Follow `reference/figma-md-template.md`. Every node ID and value comes from
script or MCP output. Measure the file and compact long tables when it nears
20,000 bytes.

## Step 6 - propose the plan

Draft, but do not write yet:

- `project-plan.md` sections 2 and 4 to 8 filled from the map (section 3, the
  content source, comes from `/onboard`)
- `build-plan.md`: 1. Site foundation (`/next-app`), then one item per page
  (new sections only; reused sections are built once, on the first page that
  needs them), one per collection, then forms and interactions, then launch
  readiness

Show the drafts, the extraction method, and the open questions. Write the plan
files only after explicit approval; preserve real content already in them. Then
update activity to `ready` and point to `/overview`.

## Never

- Never write or edit app code, `globals.css`, `components/`, or `public/`.
- Never invent, round, or average a token value; disagreements are open questions.
- Never fetch a whole large file at full depth; outline first, then single nodes.
- Never print, log, or commit the Figma token.

## Formatting

Format the output to match the project's conventions in
`blueprint/context/ai-interaction.md`.
