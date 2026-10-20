# Next.js lens

Project rules from `blueprint/context/coding-standards.md`, grouped by audit
lens. Apply only the sections for the selected lenses. Ground every finding in a
file and line; use `rg` for the searches below and read the hits before
reporting.

## Security

- **Unsafe `dangerouslySetInnerHTML`.** Allowed only for JSON-LD built with
  `JSON.stringify` from typed data, or rich text sanitized on the server. Any
  other use with CMS, URL, or user input is P0 or P1 depending on reachability.
- **Unvalidated server actions.** Every exported function in a `"use server"`
  file or inline server action parses its input with zod (`safeParse` or
  `parse`) before use, re-checks auth and ownership on the server when the data
  is not public, and never trusts client-supplied ids, prices, or roles. Route
  handlers follow the same rule.
- **Leaked environment variables.** A secret read with a `NEXT_PUBLIC_` prefix,
  any `process.env` read inside a `"use client"` module or a file it imports,
  secrets passed as props to client components, `.env` files tracked by Git, and
  secret values in `next.config` `env`. Report the variable name only, never its
  value.
- **Server-only code reachable from the client.** Payload, database, `fs`, or
  secret helpers imported (directly or transitively) by a client component.
  Server-only modules should `import "server-only"`.
- **Payload access control.** Collections without explicit `access`, public
  `create`, `update`, or `delete`, admin-only fields readable by the public API,
  and the Local API used with `overrideAccess` on user-driven requests.
- **Open redirects and unchecked URLs.** `redirect()` or links built from query
  input without an allow-list.

## Performance

- **Client components that could be server components.** A `"use client"` file
  that uses no state, effects, refs, event handlers, browser APIs, or
  client-only libraries. Also a whole section marked client when only one leaf
  needs interaction. Report the leaf that should hold the boundary.
- **Missing `next/image`.** Raw `<img>` for content or Figma images, images
  without `width`/`height` or `fill` plus `sizes`, more than one `priority`
  image per page, a hero image without `priority`, and remote images without a
  `remotePatterns` entry.
- **N+1 data fetching.** Queries or `fetch` calls inside `map` loops or per-card
  components, Payload `find` with unbounded `depth` or no `limit`, the same data
  fetched by several components on one page without `cache()` or a single
  page-level read, and `generateStaticParams` that fetches each item one by one.
- **Fonts.** Fonts loaded through `<link>` or CSS `@import` instead of
  `next/font`, or weights loaded that the tokens never use.
- **Rendering.** `force-dynamic` or `cache: "no-store"` on content that is
  static, and large client-side libraries imported where a shadcn primitive or
  CSS would do.

## Quality

- **Design tokens.** Arbitrary values in classes (`text-[17px]`,
  `bg-[#1D4F91]`, `mt-[23px]`), hex or rgb literals in TSX, inline `style` other
  than a CSS variable from content, and edits inside the generated
  `figma-tokens` block in `globals.css` (it must match `tokens-to-css.mjs`
  output). Search: `rg -n '\w-\[' --glob '*.tsx'` and
  `rg -n '#[0-9a-fA-F]{3,8}\b' --glob '*.tsx'`.
- **Dynamic class names.** Template literals or concatenation that build
  Tailwind classes (`` `text-${size}` ``, `"bg-" + tone`); Tailwind cannot see
  them, so the style silently disappears. Use full class names, `cn()`, and
  `cva`.
- **shadcn defaults left in place.** Default palette or radius values in the
  shadcn variables, a shadcn component whose classes override the design with
  arbitrary values, or a wrapper component that exists only to restyle another.
- **Section contract.** A section without `data-section` on its root, measured
  elements without `data-el`, `data-el` names duplicated across unrelated
  elements, a section folder name that differs from its registry key or Payload
  block slug, and near-duplicate sections that should be one component with a
  variant.
- **Content in code.** Copy, alt text, or links hard-coded in a section instead
  of read from content.

## Tests

- Server actions, zod schemas, and content getters without tests when a test
  command is declared.
- No unit tests for sections or styling; flag them as brittle only when they
  assert class names or snapshot markup.
