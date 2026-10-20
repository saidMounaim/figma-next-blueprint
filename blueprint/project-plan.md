# Project Plan

> One of the two planning docs you provide. `/figma <url>` drafts the Design,
> Pages, Sections, Collections, and Global parts sections from the Figma file for
> you to review. Add as much detail as the project needs: rationale, constraints,
> edge cases, and explicit exclusions. When it is filled in, run `/overview` to
> generate the project overview from this plus `build-plan.md`.

## 1. Client and purpose

Who the site is for and what it must achieve (leads, bookings, portfolio,
information, sales).

## 2. Design source

- Figma file URL:
- Pages or frames in scope:
- Designed frame widths (for example 375 / 768 / 1440):
- Anything in Figma that is out of scope or not final:

## 3. Content source

`none` (typed content files in `content/`) or `payload` (Payload CMS inside the
app, sections as blocks). Set by `/onboard`. For Payload, note the database
(Postgres recommended) and who edits content.

## 4. Pages

One line per page with its route: `Home - /, sections from content`.

## 5. Sections

One line per reusable section from Figma, with the pages that use it. `/figma`
fills this from the design.

## 6. Collections

Repeated content with its own list or detail pages (posts, projects, team):
name, routes, and key fields. Write "none" if the site only has pages.

## 7. Global parts

Header and footer content (logo, navigation, contact info, socials, CTAs) and
where it is edited.

## 8. Interactions and animation

Menus, sliders, accordions, tabs, modals, filters, and any animation. List them
so they are not forgotten; details can be explored later.

## 9. Forms and integrations

Contact forms (server action plus email provider), newsletter, maps, analytics,
third-party embeds. Env var names only, never values.

## 10. SEO and launch

Site name, default title and description, domain, social image, and any
structured data (Organization, LocalBusiness, Article).

## 11. Deployment

Target host (Vercel recommended), domain, env vars by name, database and media
storage for Payload.

## 12. Usage model and constraints (optional)

Record only what is known and relevant: expected traffic, who edits content,
security or compliance constraints, and explicit non-requirements. Leave this
section unanswered when those facts are not established. Unknown does not mean
enterprise, hostile, multi-tenant, or single-user.
