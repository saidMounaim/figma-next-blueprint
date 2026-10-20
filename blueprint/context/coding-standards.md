# Coding Standards

> House conventions for Figma-to-Next.js sites: App Router, TypeScript strict,
> Tailwind CSS v4 with Figma tokens, shadcn/ui for interactive primitives, and
> typed content or Payload CMS. `/onboard` fills in the project-specific values
> (content source, source directory, local URL) and leaves the rest. Review the
> result before `/overview`.

## Project identity

- Content source: `<content-source>` <!-- set by /onboard: none or payload -->
- Source directory: `<src-dir>` <!-- set by /onboard: "src/" or "" (project root) -->
- Local URL: `http://localhost:3000` <!-- set by /onboard -->
- Package manager: `<package-manager>` <!-- set by /onboard -->

Paths below are written from the source directory. With `src/`, `app/` means
`src/app/`.

## TypeScript

- Strict mode enabled (`"strict": true`); do not loosen compiler options to
  silence an error
- No `any` types - use proper typing or `unknown`
- Define types for all props, content shapes, and data models
- Use type inference where obvious, explicit types where helpful

## React and Next.js

- App Router only. Server Components by default.
- Add `"use client"` only to the smallest leaf that needs state, effects, event
  handlers, or browser APIs. A section stays a Server Component and renders a
  client leaf (`HeroSlider.tsx`) for the interactive part.
- Never import server-only code (Payload, `fs`, secrets) into a client
  component. Mark server-only modules with `import "server-only"`.
- Fetch data directly in Server Components through `lib/content.ts`. Fetch once
  per page and pass data down; never query inside a loop or per card.
- Server Actions live in `actions/<feature>.ts`, start with `"use server"`,
  validate every input with zod (`safeParse`), and return
  `{ success: true, data } | { success: false, error }`. Never trust
  client-supplied ids or prices.
- Route handlers (`app/api/.../route.ts`) only for webhooks, third-party
  callbacks, or endpoints that need specific status codes or headers.
- Metadata through the Metadata API: `metadata` in `app/layout.tsx` with
  `metadataBase`, `title.template`, and defaults; `generateMetadata` on every
  dynamic route. `app/sitemap.ts` and `app/robots.ts` are always present.
- Dynamic content routes export `generateStaticParams` and call `notFound()` for
  unknown slugs.
- Environment variables: secrets have no `NEXT_PUBLIC_` prefix and are read only
  in server code. `.env*` stays git-ignored; document names in `.env.example`.
- `dangerouslySetInnerHTML` only for JSON-LD built with `JSON.stringify` from
  typed data, or rich text already sanitized on the server. Never for raw CMS or
  user input.

## Project structure

```text
app/
  layout.tsx                 fonts, metadata, Header, Footer
  globals.css                Tailwind, Figma tokens block, shadcn variables
  [[...slug]]/page.tsx       page renderer (content source none)
  (frontend)/[[...slug]]/page.tsx and (payload)/admin/...   (content source payload)
  <collection>/page.tsx  <collection>/[slug]/page.tsx
  sitemap.ts  robots.ts  not-found.tsx
components/
  layout/Header.tsx  Footer.tsx
  sections/<Name>/<Name>.tsx          one Figma section
  sections/<Name>/<Name>.types.ts     its props type
  sections/<Name>/<Name>.block.ts     Payload block (payload only)
  sections/<Name>/<Name><Part>.tsx    "use client" leaf, only when needed
  sections/registry.ts                section type -> component
  PageRenderer.tsx
  ui/                                 shadcn components
  icons/<Name>.tsx                    SVG icon components
content/                              typed content (content source none)
  pages/<slug>.ts  <collection>/<slug>.ts  site.ts  types.ts
collections/<Name>.ts                 Payload collections (payload only)
lib/  utils.ts (cn)  content.ts  metadata.ts
actions/<feature>.ts
public/images/<section>/<descriptive-name>.<ext>
```

## Sections

One Figma section = one component with the same name everywhere:

| Piece | Name |
| --- | --- |
| Folder and component | `components/sections/Hero/Hero.tsx`, PascalCase |
| Section type key | `hero`, kebab-case, used in content files and the registry |
| Root attribute | `data-section="hero"` on the root element |
| Payload block slug | `hero`, in `Hero.block.ts` |
| Map entry | `"hero"` in `blueprint/design/map.json` |

- The root element is a semantic landmark or `<section>` with
  `data-section="<type>"` and an `aria-labelledby` pointing at its heading when
  it has one.
- Every element `/pixel-check` must measure carries `data-el="<name>"`: title,
  text, buttons, images, cards, list containers. Names are kebab-case and unique
  within the section (`title`, `cta-primary`, `card`). Repeated items share one
  name. These attributes are stable test hooks; never style with them.
- Props come from `<Name>.types.ts`. In Payload mode, the props type is the
  generated block type from `payload-types.ts`.
- A section returns `null` when its required content is missing.
- Headings follow the page outline, not the font size. Only the first section of
  a page renders the `h1`, and only when the design gives it the page title.
- Before creating a section, check `components/sections/` for an existing one.
  A variant is a prop (`tone: "light" | "dark"`) resolved with `cva`, never a
  near-duplicate component.

## Styling (Tailwind v4, pixel-perfect)

- Every design value comes from the Figma tokens that `tokens-to-css.mjs`
  writes between `/* figma-tokens:start */` and `/* figma-tokens:end */` in
  `app/globals.css`: colors, font families, font sizes with their line heights
  and letter spacing, spacing, radii, shadows, container width, and breakpoints.
  Never hand-edit that block; change `blueprint/design/tokens.json` and rerun the
  script.
- Use token utilities (`bg-primary`, `text-h1`, `p-section`, `rounded-card`,
  `shadow-card`, `max-w-container`). Tailwind's default spacing multiples
  (`gap-6`, `px-4`) are allowed only when they equal the Figma value exactly.
- No arbitrary values in classes (`text-[17px]`, `bg-[#1D4F91]`, `mt-[23px]`) and
  no hex, rgb, or px values in TSX. A Figma value without a token is either a new
  token (add it to `tokens.json` and regenerate) or a section-local CSS variable
  set through a token, never an inline number.
- Never build class names by string concatenation or interpolation; Tailwind
  cannot see them. Use full class names, `cn()` from `lib/utils.ts`, and `cva`
  for variants.
- Mobile-first: unprefixed classes match the smallest Figma frame, then
  breakpoint prefixes generated from the Figma frames (`md:`, `lg:`, plus any
  extra frame). Breakpoints are listed in `blueprint/context/figma.md`.
- Fluid `clamp()` tokens are used only when every designed frame lands within
  2px of the interpolated value; otherwise use breakpoint classes.
- Layout with Flexbox and Grid. Translate Figma absolute positions into gaps and
  padding; never use absolute positioning for layout. Decorative overlays are
  the only exception.
- No inline `style` attributes except a CSS variable set from content
  (`style={{ "--bg-image": ... }}`).
- Respect `motion-reduce:` for any transition or animation.

## shadcn/ui

- Use shadcn components for interactive primitives the design needs: Sheet or
  Dialog for the mobile menu and modals, Accordion, Tabs, Select, Form fields,
  Carousel. Add them with `npx shadcn@latest add <component>` as part of a
  reviewed step.
- shadcn's semantic variables (`--background`, `--foreground`, `--primary`,
  `--primary-foreground`, `--muted`, `--accent`, `--border`, `--input`, `--ring`,
  `--radius`, and the others it ships) are mapped to Figma tokens inside the
  generated block. Default shadcn colors, radius, and fonts must not appear on
  the site.
- Restyle a shadcn component through its `cva` variants and tokens until it
  matches Figma. Do not wrap it in a second component just to override classes.
- Static markup that is not interactive (cards, buttons that are plain links,
  badges) is plain JSX with token classes; a shadcn component is not required.

## Fonts, images, and icons

- Fonts through `next/font`: `next/font/google` for Google Fonts,
  `next/font/local` with files in `app/fonts/` for licensed fonts. Each font
  exposes a CSS variable that the tokens block maps to `--font-*`.
- Every image uses `next/image` with `width` and `height` (or `fill` plus
  `sizes`), a meaningful `alt` from content (empty `alt` only for decoration),
  and `priority` only for the above-the-fold hero image. Remote CMS images need
  `images.remotePatterns` in `next.config`.
- Images exported from Figma live in `public/images/<section>/` with descriptive
  kebab-case names (`hero-team-meeting.jpg`), never node ids.
- Icons are React components in `components/icons/` exported from Figma SVG:
  `fill`/`stroke` set to `currentColor` for single-color icons, `aria-hidden` by
  default, and `title` support when an icon carries meaning.

## Content

- **Content source `none`:** pages are typed objects in `content/pages/<slug>.ts`
  with `sections: SectionData[]`, a discriminated union on `type` defined in
  `content/types.ts`. Collections are typed files in `content/<collection>/`.
  `lib/content.ts` is the only reader.
- **Content source `payload`:** Payload runs inside the Next app. Pages are a
  `pages` collection with a `layout` blocks field; every section adds its
  `<Name>.block.ts` to that field. Collections live in `collections/`. Run
  `payload generate:types` after schema changes and import types from
  `payload-types.ts`. Server code reads through the Local API with explicit
  `depth`, `limit`, and `select`. Access control is defined on every collection;
  public read access is explicit.
- Copy, alt text, and links come from content, never hard-coded in a section.
  Fixed decoration stays in the component.

## Accessibility

- Semantic landmarks (`header`, `nav`, `main`, `footer`), one `h1` per page,
  heading levels that follow the design hierarchy.
- Every interactive element is reachable and operable by keyboard, with a
  visible focus style using the `ring` token.
- Links that look like buttons are `<a>` (`next/link`); actions are `<button>`.
- Color contrast from Figma is used as-is. Flag pairs below WCAG AA in review
  rather than silently changing the design.

## Pixel-perfect verification

- A section is done only when `/pixel-check` compares it against its Figma node
  at every designed frame width and reports no unresolved difference above the
  tolerance: 2px for spacing, size, and position; exact for font family, font
  weight, color, and radius.
- Pixel-check uses real content matching the Figma copy, not lorem ipsum.
- A pass is current only while the git `HEAD` and working-tree diff it recorded
  still match. Any later code change makes it stale.

## Testing

The blueprint installs no test runner; testing is opt-in at the project level.
Adding unit testing is an explicit setup task the AI can do through the normal
workflow, either as a build-plan item or with `/tests`. The setup should choose
the stack-native runner, wire the scripts or commands, add a small example
test, and update the Commands section of `AGENTS.md`.

When `AGENTS.md` declares a `Verify` command, treat it as the umbrella automated
gate. It combines only the checks this project actually has, in this order when
available: typecheck, tests, then build. `/ci` owns Verify and CI setup.

**The opt-in switch is one signal: a `test` command in the Commands section of
`AGENTS.md`.** Declare one and **tests become a gate for logic-bearing steps**,
not an optional extra; leave it out and the loop verifies logic with the evidence
it already uses (run it, a screenshot, the build). Adding the runner is itself a
deliberate step, never a silent mid-step install. This is the single definition
of the switch; the skills and `ai-interaction.md` only point back here.

- **What to test (the scope rule):** pure logic where a wrong answer is possible -
  zod schemas, server actions, content getters, slug and metadata builders,
  formatters. These have assertable inputs and outputs and real edge cases.
- **What not to test:** UI components and sections. Verify those with
  `/pixel-check`, a screenshot, and the build, not brittle unit tests.
- **The gate (when a runner is configured):** a build step that adds in-scope logic
  must ship a passing test in the same reviewable diff. UI-only steps are exempt
  and ride on pixel-check plus build evidence.
- An empty suite should fail, not pass, so "no tests ran" never looks like "passed".
- Test files live next to source files (for example `contact.test.ts`).
- Run them via the project's test command (see Commands in `AGENTS.md`).

Stack binding: Vitest, with `vi.mock()` for Payload and other external
dependencies.

## Browser Verification

For UI and integration behavior, prefer real browser evidence over reading the
code and assuming it works.

- Playwright is installed by `/onboard` (after approval) because `/pixel-check`,
  `/a11y`, and `/perf` need it. A repeatable `Browser tests` command is still a
  separate opt-in through `/tests browser`.
- Never start or stop the user's dev server without asking. If a check needs the
  app and it is not running, ask the user to run the dev command.
- Browser evidence is required for flows that click, type, submit, navigate,
  open menus or dialogs, or depend on client-side state.

## Code Quality

- No commented-out code unless specified
- No unused imports or variables
- Keep functions under 50 lines when possible

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
