# tokens.json

`blueprint/design/tokens.json` is the single source of design tokens.
`blueprint/scripts/tokens-to-css.mjs` turns it into the generated block in
`app/globals.css`. Values in px are numbers; strings pass through unchanged
(`"clamp(2.5rem, 1.6rem + 3.8vw, 4rem)"`).

```json
{
  "schemaVersion": 1,
  "source": { "fileKey": "AbC123", "extractedAt": "2026-10-20T12:00:00Z", "method": ["styles", "nodes"] },
  "frames": { "base": 375, "md": 768, "lg": 1440 },
  "breakpoints": { "md": { "minWidth": 768 }, "lg": { "minWidth": 1024 } },
  "color": { "brand": "#1D4F91", "ink": "#0F1D30", "paper": "#F3F6FA", "white": "#FFFFFF", "line": "#D3DCE6", "danger": "#C62828" },
  "font": {
    "heading": { "family": "Archivo", "source": "google", "weights": [600, 700], "variable": "--font-archivo" },
    "body": { "family": "IBM Plex Sans", "source": "google", "weights": [400, 500], "variable": "--font-plex" }
  },
  "text": {
    "h1": { "font": "heading", "size": { "base": 40, "lg": 64 }, "lineHeight": { "base": 48, "lg": 72 }, "letterSpacing": -0.5, "weight": 700 },
    "body": { "font": "body", "size": 16, "lineHeight": 24, "weight": 400 }
  },
  "spacing": { "section": { "base": 64, "md": 96, "lg": 120 }, "gutter": { "base": 20, "lg": 120 } },
  "container": { "site": 1200 },
  "radius": { "card": 16, "button": 999 },
  "shadow": { "card": "0px 4px 24px 0px rgba(15, 29, 48, 0.08)" },
  "shadcn": {
    "background": "white", "foreground": "ink", "primary": "brand", "primary-foreground": "white",
    "border": "line", "input": "line", "ring": "brand", "destructive": "danger", "radius": "card"
  }
}
```

## Rules

- Names are lowercase kebab-case. Color names must not be shadcn variable names
  (`background`, `foreground`, `primary`, `secondary`, `muted`, `accent`,
  `destructive`, `border`, `input`, `ring`, `card`, `popover`, `chart-*`,
  `sidebar*`, and their `-foreground` pairs). Map them under `shadcn` instead.
- `frames` records which Figma width each breakpoint key was measured from.
  `breakpoints` records where the value starts to apply (`minWidth`, px). The
  smallest frame is `base` and needs no entry.
- Responsive values are objects keyed by `base` and breakpoint names. Use them
  only when frames really differ.
- `text.<name>.font` names a `font` entry; `/next-app` applies it with a
  `font-<name>` class next to `text-<name>`. Letter spacing is px from Figma.
- Colors are `#RRGGBB` or `#RRGGBBAA` exactly as Figma reports them.
- `shadcn.radius` names a `radius` token; every other `shadcn` key names a color.

## Generated utilities

| Token | Utilities |
| --- | --- |
| `color.brand` | `bg-brand`, `text-brand`, `border-brand`, `ring-brand` |
| `text.h1` | `text-h1` (size, line height, letter spacing, weight) |
| `font.heading` | `font-heading` |
| `spacing.section` | `p-section`, `py-section`, `gap-section`, `mt-section` |
| `container.site` | `max-w-site` |
| `radius.card` | `rounded-card` |
| `shadow.card` | `shadow-card` |
| `breakpoints.md` | `md:` prefix |

Responsive values switch automatically: `text-h1` is 40px below `lg` and 64px
from `lg` up, without `lg:` classes.
