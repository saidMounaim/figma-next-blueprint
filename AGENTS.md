# AGENTS.md

Instructions for AI coding agents working in this project. This is the cross-tool
entry point. Codex, Google Antigravity, and OpenCode read `AGENTS.md`. Other
compatible tools do too. Claude Code reads `CLAUDE.md`, which imports this file,
so there is a single source of truth.

Claude Code, Codex, and every other AI tool must not add AI attribution to
commits or pull requests, including AI `Co-Authored-By` trailers or generated-by
signatures. Preserve genuine human attribution. See
[Commit and PR attribution](blueprint/context/ai-interaction.md#commit-and-pr-attribution)
for optional tool settings.

## What this is

A description of your project and the problem it solves.

This project is built with **figma-next-blueprint**: Figma designs turned into a
pixel-perfect Next.js site, one reviewed feature at a time. It is a workflow
layer on top of the [AI Blueprint](https://ai-blueprint.dev), not an app
skeleton.

- **Design source:** Figma URLs, read through `blueprint/scripts/figma-extract.mjs`
  (Figma REST API with `FIGMA_TOKEN`), or the Figma Dev Mode MCP server when it
  is available in the session
- **App:** Next.js App Router, TypeScript strict, Server Components by default
- **Styling:** Tailwind CSS v4 with tokens generated from Figma into
  `app/globals.css`, shadcn/ui for interactive primitives
- **Content:** typed files in `content/` or Payload CMS blocks, chosen in
  `/onboard`
- **Verification:** Playwright-driven `/pixel-check` against Figma at every
  designed frame width, plus `/seo`, `/a11y`, and `/perf` reports

Next.js writes managed blocks into this file (between
`<!-- BEGIN:nextjs-... -->` and `<!-- END:nextjs-... -->` markers, usually at
the end) and `next dev` restores them. Never edit or remove them, and commit them
with your work. When they point to `node_modules/next/dist/docs/`, read the
relevant guide there before writing Next.js code: it matches the installed
version.

Scaffold the app first with `create-next-app`, then overlay these files on top.
Never run a framework scaffolder inside a directory that already holds the
blueprint files (`AGENTS.md`, `CLAUDE.md`, `.agents/`, `.claude/`, `blueprint/`);
it fails because the directory isn't empty.

## Proportional engineering

Build for established requirements, not hypothetical scale, threats, or future
flexibility. Reuse existing code, the standard library, Next.js and React
features, Tailwind, installed shadcn components, and installed dependencies
before adding machinery.

- Unknown scale or extensibility defaults to the smaller reversible design. Do
  not infer enterprise, multi-tenant, hostile-user, or compliance requirements.
- Derive trust and data-integrity boundaries from actual reachability: server
  actions, route handlers, forms, untrusted input, auth/session/ownership, the
  Payload admin and its access control, shared persisted data, destructive
  operations, payments, secrets, and sensitive data.
- Ask only when an unknown materially changes behavior, architecture, persisted
  data, interoperability, a real security boundary, or cost. Otherwise choose the
  simplest repository-native implementation.
- Add an abstraction, dependency, service, configuration surface, compatibility
  layer, or security mechanism only for a current requirement.
- Simplicity never removes real trust-boundary validation, data-loss prevention,
  accessibility, explicit security requirements, configured tests, the
  pixel-check gate, or project rules.
- Stack-specific template standards apply only when the project uses that stack.

## Read these when relevant

- `blueprint/config.json` - deterministic project workflow settings
- `blueprint/context/project-overview.md` - the project's source of truth
- `blueprint/context/coding-standards.md` - read before changing code
- `blueprint/context/ai-interaction.md` - read when running the Blueprint workflow
- `blueprint/context/current-feature.md` - the one feature, fix, or rollback being built in this checkout
- `blueprint/context/figma.md` - the design map written by `/figma`: breakpoints,
  fonts, sections, collections, assets, with Figma node IDs
- `blueprint/design/tokens.json` and `blueprint/design/map.json` - machine-read
  tokens and the section-to-node map used by the scripts

Reuse relevant context already loaded in the session. Claude Code imports only
this file; its Blueprint skills load the other files on demand.

## Project configuration

`blueprint/config.json` is the user-owned, machine-readable workflow policy for
this project. Workflow skills read the relevant settings before acting. A
missing file means built-in defaults. An invalid file falls back to defaults for
read-only status reporting, but mutating workflow commands stop and point to
`/doctor` instead of guessing.

Configuration can make review or verification stricter and can tune local
branch names and automated-mode limits. It never grants permission to commit,
merge, push, deploy, publish, send, delete data, waive a failing check, waive a
pixel-check, or accept a finding. Those approval and safety boundaries are not
configurable.

`qualityGates.regular` controls automatic audit, independent-review, check, and
try-guide behavior for the normal workflow and Autopilot. Independent review
defaults to `when-sensitive`, audit and check default
to `manual`, and try guide defaults to `when-testable`. The other conditional
modes are `when-sensitive` for audit, `when-behavioral` for check, and
`when-user-facing` for try guides.

`review.independentExecution` (`automatic` or `manual`) controls how a selected
independent review runs. `git.landing` (`local-merge` or `pull-request`)
controls how `/complete` offers to land finished regular work.
`workflow.stepReview` (`feature` or `every`) and `workflow.checkpointCommits`
(`disabled` or `enabled`) control review pauses during `/implement`.
`verification.uiEvidence` ships as `required` in this kit: UI done-whens need
direct browser evidence.

The pixel-check gate is not a configuration value. UI work needs a current
passing `/pixel-check` before `/complete` unless the user explicitly waives it
in the current chat; the waiver and its reason are archived with the work.

## Workflow

Build one feature, fix, or rollback at a time, behind review gates. Each step's
instructions are plain markdown skills any capable agent can read and follow:

- Claude Code: `.claude/skills/<skill>/SKILL.md`
- Codex, GitHub Copilot, Google Antigravity: `AGENTS.md` plus
  `.agents/skills/<skill>/SKILL.md`
- OpenCode: `AGENTS.md` plus the `.agents/skills/` or `.claude/skills/` tree

Unused adapters can be removed. Claude Code-only projects can delete `.agents/`
but must keep `AGENTS.md` because `CLAUDE.md` imports it. When changing shared
workflow behavior, update the matching skill in both adapter folders.

### The Figma-to-Next path

```text
/onboard  ->  /figma <url>  ->  plans  ->  /overview  ->  /next-app
(setup)       (design map,      (you       (context)      (feature 1:
               tokens, plan      review)                    foundation)
               drafts)

then for each feature:
/feature -> /implement -> /pixel-check -> /check -> /audit current -> /complete
(spec with  (/section,    (vs Figma at   (behavior) (Next.js lens)    (archive,
 Figma        /collection,  every frame                                 commit,
 nodes)       /assets)      width)                                      merge)

before launch:  /seo --all  ->  /a11y  ->  /perf  ->  /release
```

Approve the Feature spec before Implement. Check proves behavior; Audit reviews
code and records findings; Pixel-check proves the look. `/check guide` only
generates manual instructions and never performs verification.

### Parallel work

Give each developer or agent its own clone or Git worktree and one dedicated
branch before starting `/feature` or `/fix`. The branch must use the configured
prefix and the work item's lowercase kebab-case title. Never run two active work
items in the same working directory or replace another worker's active spec.
Use `git.landing: "pull-request"` when the default branch is protected or several
isolated checkouts are active.

### Skills

#### Figma and Next.js

- `figma` - read a Figma URL, extract tokens, breakpoints, fonts, sections,
  collections, and assets into `blueprint/context/figma.md`,
  `blueprint/design/tokens.json`, and `blueprint/design/map.json`, then propose
  plan drafts; never writes app code
- `next-app` - feature 1 recipe: Figma tokens into Tailwind `@theme` and shadcn
  variables, `next/font`, root layout, header, footer, page renderer, content
  layer, base metadata, sitemap, robots
- `section` - build one Figma section as a Server Component with typed props,
  `data-section` and `data-el` hooks, tokens-only Tailwind classes, and a Payload
  block when the content source is Payload
- `collection` - repeated content as typed content or a Payload collection, with
  list and detail routes, `generateStaticParams`, and metadata
- `assets` - export Figma images into `public/` and icons into
  `components/icons/` as SVG components
- `design-sync` - report what changed in Figma since the last sync and propose
  `/fix` specs; never edits code
- `pixel-check` - measure a local or live page against Figma at every frame
  width and save overlays and diffs; never edits code
- `seo` - on-page SEO report for one page or a crawl, mapped to the file to fix
- `a11y` - axe-core at every breakpoint plus a keyboard pass, mapped to files
- `perf` - Lighthouse mobile and desktop report, mapped to files

#### Build

- `feature` - turn a build-plan item into a spec, or propose a reviewed plan addition
- `implement` - build the current spec one small, reviewed step at a time
- `check` - prove the current spec against the running app, or use `check guide`
  for a read-only manual review guide
- `complete` - final safety pass, archive under `blueprint/history/`, then
  request approval for the configured local merge or pull-request landing

#### Understand and review

- `explore` - investigate an idea against the actual code without writing files
- `brief` - read-only briefing on an upcoming build-plan feature
- `status` - read-only progress summary, drift warning, and next action
- `debug` - reproduce and isolate a failure without editing code
- `audit` - review across quality, security, performance, and tests lenses, with
  a Next.js lens; records findings in `blueprint/context/findings.md`;
  `audit independent current` prepares a fresh-reviewer checkpoint
- `doctor` - workflow health check, including the Figma token and helper scripts

#### Plan and set up

- `onboard` - tune a fresh `create-next-app` project after the overlay: Node,
  Git, Tailwind, shadcn, Figma token, Playwright, content source, commands
- `discovery` - optional deep planning conversation that drafts the two plans
- `overview` - distill the two planning docs into `blueprint/context/project-overview.md`
- `tests` - set up unit testing, or a browser harness with `tests browser`
- `ci` - set up one Verify command and matching GitHub checks

#### Recover and release

- `fix` - document an ad-hoc bug or change into `blueprint/context/current-feature.md`
- `rollback` - plan a safe reversal of a completed feature
- `release` - Vercel (or Render) readiness after `/seo`, `/a11y`, and `/perf`;
  deployment needs separate approval

In Codex, invoke these as skills (`$figma`, `$feature`, and so on). In Claude
Code and Google Antigravity, use slash commands such as `/figma` or `/feature`.
These are AI chat commands, not terminal commands.

### Automation

Optional explicit-only skill: `autopilot` combines `feature` or `fix` with
`implement` in one bounded pass when directly invoked, including the configured
regular quality gates. It stops before `/complete`, merge, push, deploy, or
destructive actions.


## Dashboard activity

The dashboard can show the active or most recent substantial Blueprint command
from `blueprint/.state/run.json`. This file is generated local state, ignored by
Git, and never part of a feature commit.

Commands with meaningful progress or a durable handoff should write it when the
state directory exists: `onboard`, `discovery`, `overview`, `figma`, `next-app`,
`feature`, `fix`, `rollback`, `implement`, `debug`, `check`, `audit`, `tests`,
`ci`, `autopilot`, `complete`, and `release`. Short orientation,
recipe, and report commands (`explore`, `brief`, `status`, `doctor`, `section`,
`collection`, `assets`, `design-sync`, `pixel-check`, `seo`, `a11y`, `perf`, and
`check guide`) do not write activity state.

Writing the initial activity record is the first action of a tracked command,
before project inspection, preflight, or other tool calls. This one generated
state write does not authorize product changes or bypass any safety check.

Never create or edit `run.json` directly. From the project root, use the first
helper that exists:

```text
node .agents/skills/doctor/scripts/run-state.mjs <action> <options>
node .claude/skills/doctor/scripts/run-state.mjs <action> <options>
```

Start with `start --command <skill> --summary <truthful-summary> --boundary
<boundary>`. Use `update` at meaningful milestones or for a blocker, with
`--status blocked` and `--resume <exact-command>` when recovery is needed. End
with `finish --status ready|completed --summary <truthful-summary>`. If the
helper is missing or fails, report the activity warning and continue the
workflow without writing a manual fallback.

`status` must be `running`, `blocked`, `ready`, or `completed`. `boundary` must
be `read-only`, `reviewed`, or `local-only`. Never put secrets, raw logs, prompts,
or user content in this file. Activity tracking must not change a command's
approval boundaries or turn a reporting failure into a workflow failure.

## Automatic verification

Automatic GitHub checks are a separate explicit setup. `/onboard` only reports
existing checks and points to `/ci` when none exist. Running `/ci` defines one
`Verify` command from checks that already exist, in this order: typecheck,
tests, then build. Never invent a test runner or another check just to fill the
command. Pixel, SEO, accessibility, and performance reports are not part of
Verify.

## Required tools

- **Node.js 22+** for the app and every helper script (no extra npm packages for
  `figma-extract.mjs`, `tokens-to-css.mjs`, `seo.mjs`, or `perf.mjs`)
- **Git**, one branch per feature
- **Figma personal access token** in `.env` at the project root as
  `FIGMA_TOKEN=...` (`.env*` is git-ignored by create-next-app). Scopes: file
  content read, plus file variables read when the plan includes Figma Variables
  (Enterprise). Check it with `node blueprint/scripts/figma-extract.mjs check`. Never paste
  the token in chat. The Figma Dev Mode MCP server is optional and used for
  reading designs when present; the scripts always need the token.
- **Playwright** (`npm i -D playwright` then `npx playwright install chromium`)
  for `/pixel-check`, `/a11y`, `/perf`, and `/check`
- **axe-core** (`npm i -D axe-core`) for `/a11y`
- **Payload CMS** and a database (Postgres recommended) only when the content
  source is `payload`

## Commands

<!-- blueprint:onboarding-required -->
For a standard Next.js project. Change or remove if you're using something else.

- Dev server: `npm run dev` (http://localhost:3000)
- Build: `npm run build`
- Production server: `npm run start`
- Lint: `npm run lint`
- Typecheck: `npx tsc --noEmit`
- Figma: `node blueprint/scripts/figma-extract.mjs <command>`
- Tokens to CSS: `node blueprint/scripts/tokens-to-css.mjs`
- Pixel check: `node blueprint/scripts/pixel-check.mjs <url>`
- SEO: `node blueprint/scripts/seo.mjs check <url>` or `node blueprint/scripts/seo.mjs crawl <url>`
- Accessibility: `node blueprint/scripts/a11y.mjs <url>`
- Performance: `node blueprint/scripts/perf.mjs <url>`

Testing is opt-in. If this project does not already have a unit test runner, run
`/tests` or `$tests` to add one and update this section with the real test
commands. Browser testing is also opt-in through `/tests browser`.

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
