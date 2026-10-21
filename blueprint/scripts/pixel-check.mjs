#!/usr/bin/env node
// Measures a rendered page against Figma at every designed frame width. Read-only on app code.
// Needs playwright (devDependency) and a Figma token. Writes to blueprint/reports/pixel/.

import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { download, fetchNodes, findById, normalizeId, paint, radiusOf, renderUrls, round } from "./lib/figma.mjs";
import { launch, openPage } from "./lib/browser.mjs";
import { REPORTS, isLocal, mdTable, parseFlags, slugFromUrl, sourceFingerprint, stamp, writeJson } from "./lib/report.mjs";

const USAGE = `Usage:
  node blueprint/scripts/pixel-check.mjs <url> [--section hero,header] [--widths 375,1440] [--map file] [--out dir]
  node blueprint/scripts/pixel-check.mjs fingerprint

Compares every mapped [data-section] and [data-el] on the page with its Figma node from
blueprint/design/map.json at each frame width. fingerprint prints the source hash that makes
a pass current or stale.`;

// From coding-standards.md. Letter spacing is stricter than 2px because its whole range is small.
const TOLERANCE = { position: 2, size: 2, spacing: 2, fontSize: 2, lineHeight: 2, letterSpacing: 0.5, alpha: 0.02 };

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  const { positional, options } = parseFlags(process.argv.slice(2));
  if (positional[0] === "fingerprint") return console.log(JSON.stringify(sourceFingerprint(), null, 2));
  const url = positional[0];
  if (!url || options.help) {
    console.log(USAGE);
    process.exit(url ? 0 : 1);
  }
  new URL(url);

  const mapFile = options.map ?? "blueprint/design/map.json";
  if (!existsSync(mapFile)) throw new Error(`${mapFile} not found. Run /figma, then /section, to map sections to Figma nodes.`);
  const map = JSON.parse(await readFile(mapFile, "utf8"));
  if (!map.fileKey || !Array.isArray(map.widths) || !map.sections) throw new Error(`${mapFile} needs fileKey, widths, and sections.`);

  const widths = options.widths ? options.widths.split(",").map(Number) : map.widths;
  const only = options.section ? options.section.split(",") : null;
  const pageKey = Object.entries(map.pages ?? {}).find(([, p]) => samePath(p.route, url))?.[0] ?? null;
  const fingerprint = sourceFingerprint();
  const { day, time } = stamp();
  const outDir = options.out ?? join(REPORTS, "pixel", day, `${time}-${slugFromUrl(url)}`);
  await mkdir(outDir, { recursive: true });

  const browser = await launch();
  const results = [];
  const unmapped = new Set();
  try {
    const diffPage = await (await browser.newContext()).newPage();
    for (const width of widths) {
      results.push(await checkWidth({ browser, diffPage, url, width, map, only, pageKey, outDir, unmapped }));
    }
  } finally {
    await browser.close();
  }

  const verdict = results.every((r) => r.verdict === "pass") ? "pass" : results.some((r) => r.verdict.startsWith("unverifiable")) ? "unverifiable" : "fail";
  const summary = {
    schemaVersion: 1,
    url,
    local: isLocal(url),
    page: pageKey,
    createdAt: new Date().toISOString(),
    head: fingerprint.head,
    sourceHash: fingerprint.sourceHash,
    widths,
    sections: [...new Set(results.flatMap((r) => r.sections))],
    tolerance: TOLERANCE,
    verdict,
    results: results.map(({ rows, ...rest }) => ({ ...rest, rows: rows.filter((row) => row.status !== "pass") })),
    unmapped: [...unmapped],
    reportDir: outDir.replaceAll("\\", "/"),
  };
  await writeJson(join(outDir, "summary.json"), summary);
  await writeFile(join(outDir, "report.md"), report(summary, results));
  console.log(
    JSON.stringify(
      {
        verdict,
        report: join(outDir, "report.md").replaceAll("\\", "/"),
        sourceHash: summary.sourceHash,
        widths: results.map((r) => ({ width: r.width, verdict: r.verdict, failures: r.failures })),
        unmapped: summary.unmapped,
      },
      null,
      2
    )
  );
}

function samePath(route, url) {
  if (!route) return false;
  const a = route.replace(/\/+$/, "") || "/";
  const b = new URL(url).pathname.replace(/\/+$/, "") || "/";
  return a === b;
}

async function checkWidth({ browser, diffPage, url, width, map, only, pageKey, outDir, unmapped }) {
  const { context, page, status, errors } = await openPage(browser, url, width);
  const rows = [];
  const mismatch = {};
  const sectionsChecked = [];
  try {
    if (status && status >= 400) {
      return { width, verdict: `unverifiable (HTTP ${status})`, failures: 0, passed: 0, sections: [], rows, mismatch, consoleErrors: errors };
    }
    const present = await page.evaluate(() => [...document.querySelectorAll("[data-section]")].map((el) => el.getAttribute("data-section")));
    present.filter((name) => !map.sections[name]).forEach((name) => unmapped.add(name));

    const expected = Object.entries(map.sections).filter(([name, s]) => {
      if (only && !only.includes(name)) return false;
      if (!s.nodes?.[width]) return false;
      if (present.includes(name)) return true;
      return Boolean(s.global || (pageKey && s.pages?.includes(pageKey)));
    });

    for (const [name, s] of expected) {
      if (!present.includes(name)) {
        rows.push(row(name, "(section)", "presence", "in Figma", "missing", "", "fail", s.component));
      }
    }
    const targets = expected.filter(([name]) => present.includes(name));
    if (!targets.length) {
      return { width, verdict: "unverifiable (no mapped sections on this page)", failures: rows.length, passed: 0, sections: [], rows, mismatch, consoleErrors: errors };
    }

    const ids = targets.map(([, s]) => normalizeId(s.nodes[width]));
    const nodes = await fetchNodes(map.fileKey, ids);
    const renders = await renderUrls(map.fileKey, ids, { format: "png", scale: 1 });

    for (const [name, s] of targets) {
      sectionsChecked.push(name);
      const id = normalizeId(s.nodes[width]);
      const figmaRoot = nodes[id]?.document;
      if (!figmaRoot) {
        rows.push(row(name, "(section)", "figma node", id, "not found", "", "unverifiable", "blueprint/design/map.json"));
        continue;
      }
      const elements = Object.entries(s.elements ?? {}).filter(([, byWidth]) => byWidth?.[width]);
      const measured = await page.evaluate(measure, { section: name, elements: elements.map(([el]) => el) });
      if (!measured) {
        rows.push(row(name, "(section)", "presence", "in Figma", "missing", "", "fail", s.component));
        continue;
      }
      compareSection(rows, name, s, figmaRoot, measured, elements, width);

      const dir = join(outDir, String(width), name);
      await mkdir(dir, { recursive: true });
      const browserPng = join(dir, "browser.png");
      await page.locator(`[data-section="${name}"]`).first().screenshot({ path: browserPng });
      if (renders[id]) {
        const figmaPng = join(dir, "figma.png");
        await download(renders[id], figmaPng);
        mismatch[name] = await compareImages(diffPage, figmaPng, browserPng, dir);
      }
    }
  } finally {
    await context.close();
  }

  const failures = rows.filter((r) => r.status === "fail").length;
  const unverifiable = rows.filter((r) => r.status === "unverifiable").length;
  const passed = rows.filter((r) => r.status === "pass").length;
  const verdict = unverifiable ? `unverifiable (${unverifiable} unmeasured)` : failures ? `fail (${failures} differences)` : "pass";
  return { width, verdict, failures, passed, sections: sectionsChecked, rows, mismatch, consoleErrors: errors };
}

function row(section, element, property, figma, browser, diff, status, file) {
  return { section, element, property, figma, browser, diff, status, file };
}

// Runs in the page. Returns boxes relative to the section root and computed styles, colors as hex.
function measure({ section, elements }) {
  const root = document.querySelector(`[data-section="${CSS.escape(section)}"]`);
  if (!root || !root.getClientRects().length) return null;
  const rootRect = root.getBoundingClientRect();
  const ctx = document.createElement("canvas").getContext("2d");
  const toHex = (c) => {
    let r, g, b, a = 1;
    const m = c.match(/^rgba?\(([^)]+)\)$/);
    if (m) {
      [r, g, b, a = 1] = m[1].split(/[\s,/]+/).filter(Boolean).map((v) => (v.endsWith("%") ? parseFloat(v) / 100 : Number(v)));
    } else {
      ctx.clearRect(0, 0, 1, 1);
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const d = ctx.getImageData(0, 0, 1, 1).data;
      [r, g, b, a] = [d[0], d[1], d[2], d[3] / 255];
    }
    const hex = "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("").toUpperCase();
    return { hex, alpha: Math.round(a * 1000) / 1000 };
  };
  const num = (v) => (v === "normal" ? "normal" : parseFloat(v));
  const box = (r) => ({ x: r.left - rootRect.left, y: r.top - rootRect.top, w: r.width, h: r.height });
  const style = (el) => {
    const cs = getComputedStyle(el);
    return {
      display: cs.display,
      fontFamily: cs.fontFamily,
      fontWeight: Number(cs.fontWeight),
      fontSize: parseFloat(cs.fontSize),
      lineHeight: num(cs.lineHeight),
      letterSpacing: cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing),
      color: toHex(cs.color),
      background: toHex(cs.backgroundColor),
      padding: [cs.paddingTop, cs.paddingRight, cs.paddingBottom, cs.paddingLeft].map(parseFloat),
      rowGap: num(cs.rowGap),
      columnGap: num(cs.columnGap),
      radius: [cs.borderTopLeftRadius, cs.borderTopRightRadius, cs.borderBottomRightRadius, cs.borderBottomLeftRadius].map(parseFloat),
    };
  };
  const textBox = (el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    const r = range.getBoundingClientRect();
    return r.width ? box(r) : null;
  };
  const out = {
    root: { box: box(rootRect), style: style(root) },
    elements: {},
    failedFonts: [...document.fonts].filter((f) => f.status === "error").map((f) => f.family.replace(/^["']|["']$/g, "")),
  };
  for (const name of elements) {
    const all = root.querySelectorAll(`[data-el="${CSS.escape(name)}"]`);
    const el = all[0];
    if (!el) {
      out.elements[name] = { missing: true };
      continue;
    }
    const rect = el.getBoundingClientRect();
    if (!el.getClientRects().length || (rect.width === 0 && rect.height === 0)) {
      out.elements[name] = { hidden: true };
      continue;
    }
    out.elements[name] = { box: box(rect), textBox: textBox(el), style: style(el), count: all.length };
  }
  return out;
}

// next/font renames families (for example "__Inter_d65c78"); compare the underlying name.
function familyName(css) {
  const first = String(css).split(",")[0].trim().replace(/^["']|["']$/g, "");
  const m = first.match(/^_*(.+?)(?:_Fallback)?_[0-9a-f]{5,}$/i);
  return (m ? m[1] : first).replace(/_/g, " ").trim().toLowerCase();
}

function relBox(node, origin) {
  const b = node.absoluteBoundingBox;
  return { x: round(b.x - origin.x), y: round(b.y - origin.y), w: round(b.width), h: round(b.height) };
}

function solidFill(node) {
  const fill = (node.fills ?? []).find((p) => p.visible !== false && p.type === "SOLID");
  if (!fill) return null;
  const value = paint(fill);
  return { hex: value.slice(0, 7), alpha: value.length > 7 ? round(parseInt(value.slice(7), 16) / 255) : 1 };
}

function radii(value, w, h) {
  const list = Array.isArray(value) ? value : [value ?? 0, value ?? 0, value ?? 0, value ?? 0];
  const half = Math.min(w, h) / 2;
  return list.map((r) => (r >= half ? "pill" : round(r)));
}

function compareSection(rows, section, s, figmaRoot, measured, elements, width) {
  const origin = figmaRoot.absoluteBoundingBox;
  const file = s.component ?? "(component not mapped)";
  const add = (element, property, figma, browser, tolerance) => {
    let status;
    let diff = "";
    if (typeof figma === "number" && typeof browser === "number") {
      const d = round(browser - figma);
      diff = d === 0 ? "0" : `${d > 0 ? "+" : ""}${d}px`;
      status = Math.abs(d) <= tolerance ? "pass" : "fail";
    } else {
      status = JSON.stringify(figma) === JSON.stringify(browser) ? "pass" : "fail";
      if (status === "fail") diff = "mismatch";
    }
    rows.push(row(section, element, property, fmt(figma), fmt(browser), diff, status, file));
    return status;
  };
  const color = (element, property, figma, browser) => {
    const same = figma.hex === browser.hex && Math.abs(figma.alpha - browser.alpha) <= TOLERANCE.alpha;
    rows.push(row(section, element, property, colorText(figma), colorText(browser), same ? "" : "mismatch", same ? "pass" : "fail", file));
  };

  const rootBox = relBox(figmaRoot, origin);
  add("(section)", "width", rootBox.w, round(measured.root.box.w), TOLERANCE.size);
  add("(section)", "height", rootBox.h, round(measured.root.box.h), TOLERANCE.size);
  const rootFill = solidFill(figmaRoot);
  if (rootFill) color("(section)", "background", rootFill, measured.root.style.background);
  layoutRows(add, "(section)", figmaRoot, measured.root.style);

  for (const font of measured.failedFonts) {
    rows.push(row(section, "(page)", "font load", "loaded", `${font} failed`, "mismatch", "fail", "app/layout.tsx"));
  }

  for (const [name, byWidth] of elements) {
    const id = normalizeId(byWidth[width]);
    const node = findById(figmaRoot, id);
    const b = measured.elements[name];
    if (!node) {
      rows.push(row(section, name, "figma node", id, "not in section", "", "unverifiable", "blueprint/design/map.json"));
      continue;
    }
    if (b.missing || b.hidden) {
      rows.push(row(section, name, "presence", "visible", b.missing ? `no data-el="${name}"` : "hidden", "", "fail", file));
      continue;
    }
    const f = relBox(node, origin);
    if (node.type === "TEXT") {
      const st = node.style ?? {};
      const autoWidth = st.textAutoResize === "WIDTH_AND_HEIGHT";
      const horizontal = autoWidth && b.textBox ? b.textBox : b.box;
      add(name, "x", f.x, round(horizontal.x), TOLERANCE.position);
      add(name, "y", f.y, round(b.box.y), TOLERANCE.position);
      if (autoWidth || st.textAutoResize === "NONE" || st.textAutoResize === "HEIGHT") add(name, "width", f.w, round(horizontal.w), TOLERANCE.size);
      add(name, "height", f.h, round(b.box.h), TOLERANCE.size);
      add(name, "font-family", String(st.fontFamily).toLowerCase(), familyName(b.style.fontFamily), 0);
      add(name, "font-weight", st.fontWeight, b.style.fontWeight, 0);
      add(name, "font-size", st.fontSize, b.style.fontSize, TOLERANCE.fontSize);
      if (st.lineHeightPx) add(name, "line-height", round(st.lineHeightPx), b.style.lineHeight, TOLERANCE.lineHeight);
      add(name, "letter-spacing", round(st.letterSpacing ?? 0), round(b.style.letterSpacing), TOLERANCE.letterSpacing);
      const fill = solidFill(node);
      if (fill) color(name, "color", fill, b.style.color);
    } else {
      add(name, "x", f.x, round(b.box.x), TOLERANCE.position);
      add(name, "y", f.y, round(b.box.y), TOLERANCE.position);
      add(name, "width", f.w, round(b.box.w), TOLERANCE.size);
      add(name, "height", f.h, round(b.box.h), TOLERANCE.size);
      const fill = solidFill(node);
      if (fill) color(name, "background", fill, b.style.background);
      const r = radiusOf(node);
      if (r !== undefined || b.style.radius.some((v) => v > 0)) {
        add(name, "radius", radii(r, f.w, f.h), radii(b.style.radius, b.box.w, b.box.h), 0);
      }
      layoutRows(add, name, node, b.style);
    }
    if (b.count > 1) rows.push(row(section, name, "instances", "first compared", String(b.count), "", "note", file));
  }

  // Padding and gap may legitimately be built differently; when every position in the section
  // matches, a padding or gap difference is a note, not a failure.
  const positionsOk = rows.filter((r) => r.section === section && ["x", "y"].includes(r.property)).every((r) => r.status === "pass");
  if (positionsOk) {
    rows
      .filter((r) => r.section === section && r.status === "fail" && /^(padding|gap)/.test(r.property))
      .forEach((r) => (r.status = "note"));
  }
}

function layoutRows(add, element, node, style) {
  if (!node.layoutMode || node.layoutMode === "NONE") return;
  const sides = ["top", "right", "bottom", "left"];
  const padding = [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].map((v) => v ?? 0);
  padding.forEach((value, i) => add(element, `padding-${sides[i]}`, round(value), round(style.padding[i]), TOLERANCE.spacing));
  if (node.itemSpacing && node.primaryAxisAlignItems !== "SPACE_BETWEEN" && /flex|grid/.test(style.display)) {
    const gap = node.layoutMode === "HORIZONTAL" ? style.columnGap : style.rowGap;
    add(element, "gap", round(node.itemSpacing), gap === "normal" ? 0 : round(gap), TOLERANCE.spacing);
  }
}

function fmt(v) {
  if (Array.isArray(v)) return v.join(" ");
  if (typeof v === "number") return `${round(v)}px`;
  return String(v);
}

function colorText(c) {
  return c.alpha >= 1 ? c.hex : `${c.hex} @${c.alpha}`;
}

async function compareImages(page, figmaPng, browserPng, dir) {
  const [a, b] = await Promise.all([readFile(figmaPng), readFile(browserPng)]);
  const result = await page.evaluate(
    async ({ a, b }) => {
      const load = (src) =>
        new Promise((resolve, reject) => {
          const img = new Image();
          img.onload = () => resolve(img);
          img.onerror = reject;
          img.src = `data:image/png;base64,${src}`;
        });
      const [fig, web] = await Promise.all([load(a), load(b)]);
      const w = Math.max(fig.width, web.width);
      const h = Math.max(fig.height, web.height);
      const canvas = (draw) => {
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        const ctx = c.getContext("2d", { willReadFrequently: true });
        ctx.fillStyle = "#fff";
        ctx.fillRect(0, 0, w, h);
        draw(ctx);
        return [c, ctx];
      };
      const [, ctxA] = canvas((ctx) => ctx.drawImage(fig, 0, 0));
      const [, ctxB] = canvas((ctx) => ctx.drawImage(web, 0, 0));
      const da = ctxA.getImageData(0, 0, w, h).data;
      const db = ctxB.getImageData(0, 0, w, h).data;
      const [diffCanvas, ctxD] = canvas(() => {});
      const out = ctxD.createImageData(w, h);
      let different = 0;
      for (let i = 0; i < da.length; i += 4) {
        const delta = Math.abs(da[i] - db[i]) + Math.abs(da[i + 1] - db[i + 1]) + Math.abs(da[i + 2] - db[i + 2]);
        if (delta > 48) {
          different++;
          out.data.set([255, 0, 60, 255], i);
        } else {
          const v = 255 - (255 - (db[i] + db[i + 1] + db[i + 2]) / 3) * 0.25;
          out.data.set([v, v, v, 255], i);
        }
      }
      ctxD.putImageData(out, 0, 0);
      const [overlayCanvas] = canvas((ctx) => {
        ctx.drawImage(web, 0, 0);
        ctx.globalAlpha = 0.5;
        ctx.drawImage(fig, 0, 0);
      });
      return {
        figma: [fig.width, fig.height],
        browser: [web.width, web.height],
        ratio: different / (w * h),
        diff: diffCanvas.toDataURL("image/png"),
        overlay: overlayCanvas.toDataURL("image/png"),
      };
    },
    { a: a.toString("base64"), b: b.toString("base64") }
  );
  const save = (name, dataUrl) => writeFile(join(dir, name), Buffer.from(dataUrl.split(",")[1], "base64"));
  await Promise.all([save("diff.png", result.diff), save("overlay.png", result.overlay)]);
  return { ratio: round(result.ratio * 100) / 100, figmaSize: result.figma, browserSize: result.browser };
}

function report(summary, results) {
  const lines = [
    `# Pixel check: ${summary.url}`,
    "",
    `- **Verdict:** ${summary.verdict}`,
    `- **Date:** ${summary.createdAt}`,
    `- **Target:** ${summary.local ? "local app" : "live site (not valid for the /complete gate)"}`,
    `- **Commit:** ${summary.head ?? "not a git repository"}`,
    `- **Source hash:** ${summary.sourceHash ?? "unavailable"}`,
    `- **Tolerance:** 2px for position, size, spacing, font size, and line height; 0.5px letter spacing; exact font family, weight, color, and radius`,
    summary.unmapped.length ? `- **Unmapped sections on the page:** ${summary.unmapped.join(", ")} (add them to map.json through /section)` : "",
    "",
    mdTable(
      ["Width", "Verdict", "Failures", "Passed checks", "Pixel mismatch"],
      results.map((r) => [
        `${r.width}px`,
        r.verdict,
        r.failures,
        r.passed,
        Object.entries(r.mismatch).map(([s, m]) => `${s} ${round(m.ratio * 100)}%`).join(", ") || "-",
      ])
    ),
    "",
  ];
  for (const r of results) {
    lines.push(`## ${r.width}px - ${r.verdict}`, "");
    const shown = r.rows.filter((x) => x.status !== "pass");
    if (shown.length) {
      lines.push(
        mdTable(
          ["Element", "Property", "Figma", "Browser", "Diff", "Status", "File to fix"],
          shown.map((x) => [`${x.section} > ${x.element}`, x.property, x.figma, x.browser, x.diff, x.status, x.file])
        ),
        ""
      );
    } else {
      lines.push("No differences above tolerance.", "");
    }
    for (const [section, m] of Object.entries(r.mismatch)) {
      const base = `${r.width}/${section}`;
      lines.push(
        `- ${section}: [figma](${base}/figma.png) · [browser](${base}/browser.png) · [overlay](${base}/overlay.png) · [diff](${base}/diff.png) (Figma ${m.figmaSize.join("x")}, browser ${m.browserSize.join("x")})`
      );
    }
    if (r.consoleErrors.length) lines.push("", `Console errors: ${r.consoleErrors.slice(0, 5).join("; ")}`);
    lines.push("");
  }
  lines.push("Pixel mismatch is a visual aid only; the verdict comes from the measured rows.", "");
  return lines.filter((l, i, all) => !(l === "" && all[i - 1] === "")).join("\n");
}
