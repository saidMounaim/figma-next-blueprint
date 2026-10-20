# Reports

Written by the read-only report skills. `/onboard` git-ignores everything here
except this file: reports are evidence for the current checkout, and `/complete`
copies the pixel-check summary into the feature archive.

| Folder | Skill | Contents |
| --- | --- | --- |
| `pixel/<date>/<run>/` | `/pixel-check` | `report.md`, `summary.json`, per breakpoint `figma.png`, `browser.png`, `overlay.png`, `diff.png` |
| `seo/<date>.md` | `/seo` | per-page and site-wide findings with the file to fix |
| `a11y/<date>/` | `/a11y` | `report.md` and raw axe results per breakpoint |
| `perf/<date>/` | `/perf` | `report.md` and Lighthouse JSON for mobile and desktop |

Reports never change code. Each one offers a `/fix` spec for its failures.
