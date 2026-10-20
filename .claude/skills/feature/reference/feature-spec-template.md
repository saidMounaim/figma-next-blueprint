# Feature: <name>

**From build-plan:** feature <n>
**Build attempt:** <positive integer, starting at 1>
**Status:** not started
**Branch:** `feature/<name>`

## Goal

What this feature delivers, in a sentence or two. Why it matters.

## Design reference

Frame widths to match: 375, 768, 1440 (from `blueprint/context/figma.md`).

| Section / template | Component | Figma node per width | Render | New or reused |
| --- | --- | --- | --- | --- |
| Hero | `components/sections/Hero` | 375: `12:345`, 768: `12:330`, 1440: `12:300` | `blueprint/reference/section-hero-1440.png` | new |

Omit this section when the feature has no visual target.

## In scope

- The specific things this feature includes.

## Out of scope

- What it deliberately doesn't touch (deferred to a later feature).

## Build loop

Build one small step at a time. Follow `workflow.stepReview` in
`blueprint/config.json`: `feature` produces one review packet after all steps,
while `every` pauses for review after each step. Offer checkpoint commits only
when `workflow.checkpointCommits` is enabled. `/complete` makes the final feature
commit. Never accept a review packet you have not read; split any diff that is
too large to review.

## Build steps

Small, reviewable units. Each ends with something working. `/implement` checks
these off as it finishes them, so progress survives a context clear: a fresh
session reads which boxes are ticked and resumes from the first unchecked step.

- [ ] **Step 1 - <step>** - what you build. *Done when:* <observable criteria>.
- [ ] **Step 2 - <step>** - what you build. *Done when:* <observable criteria>.

## Files / areas

- The files or modules this will create or change.

## Data / contracts

- Content shapes (section types in `content/types.ts`, collection types) or
  Payload blocks and collections added or changed, server action inputs (zod
  schemas), or "none yet."
- For established persisted-data or external API boundaries, record only the
  material type, format, generation source, uniqueness, default, lifecycle, and
  error behavior that implementation or later features must preserve.
- For established security, tenant, concurrency, destructive-operation, payment,
  or sensitive-data boundaries, record the trusted actor source,
  repository-first tenant scope, atomicity, idempotency, and redaction rules
  that apply.
- Do not create contracts or machinery for hypothetical future boundaries.

## Testing

- How to verify: what to click through, and the observable done-when per step.
- `/pixel-check` URL, sections, and frame widths per visual step, plus the
  content to enter so the page matches the Figma copy.
- If a test runner is configured, name the in-scope logic that needs a test
  (parsers, formatters, validators, server actions - not components or
  integration/render routes), so each logic-bearing step ships its test. If no
  runner is configured, say so and rely on screenshot plus build evidence. See the
  Testing gate in `coding-standards.md`.

## Notes for the AI

- Conventions and constraints to respect (e.g. client vs server, filter user-scoped queries by the authenticated user's id, match an existing data shape).
