# map.json

`blueprint/design/map.json` links the code to Figma. `/figma` writes pages and
sections; `/section` and `/collection` add components and elements.
`scripts/pixel-check.mjs` reads it to know which Figma node to compare with each
`data-section` and `data-el` at each width.

```json
{
  "schemaVersion": 1,
  "fileKey": "AbC123",
  "widths": [375, 768, 1440],
  "pages": {
    "home": { "route": "/", "frames": { "375": "1:2", "768": "1:40", "1440": "1:80" } },
    "project": { "route": "/projects/sample", "frames": { "1440": "5:10" }, "template": true }
  },
  "sections": {
    "header": {
      "component": "components/layout/Header.tsx",
      "global": true,
      "nodes": { "375": "1:3", "768": "1:41", "1440": "1:81" },
      "elements": {
        "logo": { "375": "1:4", "768": "1:42", "1440": "1:82" },
        "nav": { "1440": "1:85" },
        "menu-button": { "375": "1:6", "768": "1:44" }
      }
    },
    "hero": {
      "component": "components/sections/Hero/Hero.tsx",
      "pages": ["home"],
      "nodes": { "375": "12:345", "768": "12:330", "1440": "12:300" },
      "elements": {
        "title": { "375": "12:350", "768": "12:331", "1440": "12:310" },
        "text": { "375": "12:351", "768": "12:332", "1440": "12:311" },
        "cta-primary": { "375": "12:360", "768": "12:333", "1440": "12:320" },
        "image": { "375": "12:370", "1440": "12:325" }
      }
    }
  }
}
```

## Rules

- Keys under `sections` are the section type keys used in `data-section`, the
  registry, content files, and Payload block slugs.
- `nodes` and element entries are keyed by frame width as a string. A missing
  width means the element does not exist at that width (for example the desktop
  nav on mobile); pixel-check then skips it there.
- An element key is the `data-el` value. Repeated items (cards) map the first
  instance; pixel-check compares the first matching element.
- `global: true` sections are expected on every page; others only on the pages
  listed. `template: true` marks a detail-page design measured on one sample URL.
- Node IDs use colons (`12:345`), as the scripts print them.
