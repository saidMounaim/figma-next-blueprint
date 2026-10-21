#!/usr/bin/env node
// Figma extraction CLI for figma-next-blueprint. No dependencies (Node 22+).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  CACHE_DIR,
  FigmaError,
  api,
  colorValue,
  disableCache,
  download,
  effect,
  fetchNode,
  normalizeId,
  paint,
  parseUrl,
  radiusOf,
  renderUrls,
  round,
  simplify,
} from "./lib/figma.mjs";
import { parseFlags, writeJson } from "./lib/report.mjs";

const USAGE = `Usage: node blueprint/scripts/figma-extract.mjs <command> [args] [options]

Commands:
  check                          verify the token (reads only the token owner)
  parse    <url>                 file key and node id from a Figma URL
  outline  <url> [--depth N]     layer tree with node ids and sizes (default depth 3)
  node     <url> [--depth N] [--out file]
                                 simplified JSON tree (default: ${CACHE_DIR}/<key>-<node>.json)
  tokens   <url> [<url> ...] [--out file]
                                 raw token data from Variables, styles, and node values
                                 (default: ${CACHE_DIR}/tokens-raw.json)
  images   <url> [--ids a:b,c:d] [--scale 1] [--format png|jpg|svg] [--out dir] [--name prefix] [--file path]
                                 render nodes (--file sets the exact path for a single id)
  fills    <url> [--out dir]     download the original image fills used inside the node
  export   <url> --ids a:b,c:d --names a,b [--format svg|png|jpg] [--scale 2] [--out dir] [--component]
                                 export assets with descriptive names; --component turns SVGs
                                 into React components (<Name>.tsx)
  snapshot <url> [<url> ...] [--out file]
                                 diff-friendly snapshot of frames for /design-sync
  diff     <old.json> <new.json> changes between two snapshots

Options: --no-cache bypasses the 15 minute API cache in ${CACHE_DIR}/cache.
URLs: figma.com/design|file|proto|board/<key>/...?node-id=12-34`;

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(error instanceof FigmaError ? 2 : 1);
});

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional, options } = parseFlags(rest, ["component", "no-cache"]);
  if (options["no-cache"]) disableCache();

  switch (command) {
    case "check":
      return check();
    case "parse":
      return print(parseUrl(positional[0]));
    case "outline":
      return outline(parseUrl(positional[0]), Number(options.depth ?? 3));
    case "node":
      return saveNode(parseUrl(positional[0]), options);
    case "tokens":
      return tokens(positional.map(parseUrl), options);
    case "images":
      return images(parseUrl(positional[0]), options);
    case "fills":
      return fills(parseUrl(positional[0]), options);
    case "export":
      return exportAssets(parseUrl(positional[0]), options);
    case "snapshot":
      return snapshot(positional.map(parseUrl), options);
    case "diff":
      return diff(positional[0], positional[1]);
    default:
      console.log(USAGE);
      process.exit(command ? 1 : 0);
  }
}

function print(value) {
  console.log(JSON.stringify(value, null, 2));
}

async function check() {
  try {
    const me = await api("/me", { cache: false });
    console.log(`Token OK for ${me.handle}.`);
  } catch (error) {
    // Tokens created without the current_user:read scope cannot read /me but may still read files.
    if (error.status === 403) {
      console.log("Token found, but /v1/me returned 403. If file commands work, the token simply lacks current_user:read.");
      process.exit(2);
    }
    throw error;
  }
}

async function outline(ref, depth) {
  const { document, name } = await fetchNode(ref, depth + 1);
  console.log(`File: ${name}`);
  const walk = (node, level) => {
    if (level > depth) return;
    const box = node.absoluteBoundingBox;
    const size = box ? ` ${Math.round(box.width)}x${Math.round(box.height)}` : "";
    const hidden = node.visible === false ? " (hidden)" : "";
    console.log(`${"  ".repeat(level)}${node.type} "${node.name}" [${node.id}]${size}${hidden}`);
    for (const child of node.children ?? []) walk(child, level + 1);
  };
  walk(document, 0);
}

async function saveNode(ref, options) {
  const raw = await fetchNode(ref, options.depth ? Number(options.depth) : undefined);
  const origin = raw.document.absoluteBoundingBox ?? { x: 0, y: 0 };
  const tree = simplify(raw.document, origin, raw.styles, raw.components);
  const out = options.out ?? join(CACHE_DIR, `${ref.fileKey}-${(ref.nodeId ?? "root").replaceAll(":", "-").replaceAll(";", "_")}.json`);
  await writeJson(out, { file: raw.name, fileKey: ref.fileKey, ...tree });
  console.log(`Saved ${out}`);
}

// ---------- tokens ----------

async function variables(fileKey) {
  try {
    const data = await api(`/files/${fileKey}/variables/local`);
    const vars = data.meta?.variables ?? {};
    const collections = data.meta?.variableCollections ?? {};
    const resolveValue = (variable, modeId, seen = new Set()) => {
      const value = variable.valuesByMode?.[modeId] ?? Object.values(variable.valuesByMode ?? {})[0];
      if (value?.type === "VARIABLE_ALIAS") {
        const target = vars[value.id];
        if (!target || seen.has(value.id)) return null;
        seen.add(value.id);
        const targetCollection = collections[target.variableCollectionId];
        return resolveValue(target, targetCollection?.defaultModeId, seen);
      }
      if (value && typeof value === "object" && "r" in value) return colorValue(value);
      return value ?? null;
    };
    const list = Object.values(vars)
      .filter((v) => !v.remote && !v.hiddenFromPublishing)
      .map((v) => {
        const collection = collections[v.variableCollectionId];
        const modes = Object.fromEntries(
          (collection?.modes ?? []).map((m) => [m.name, resolveValue(v, m.modeId)])
        );
        return {
          name: v.name,
          collection: collection?.name ?? null,
          type: v.resolvedType,
          value: resolveValue(v, collection?.defaultModeId),
          modes,
          scopes: v.scopes,
        };
      });
    return { status: list.length ? "ok" : "empty", list };
  } catch (error) {
    if (error.status === 403) {
      return {
        status: "unavailable",
        reason: "403: the Variables REST API needs a Figma Enterprise plan and a token with the file_variables:read scope.",
        list: [],
      };
    }
    throw error;
  }
}

function emptyBucket() {
  return { colors: new Map(), text: new Map(), spacing: new Map(), radii: new Map(), shadows: new Map() };
}

function add(map, key, extra) {
  if (key === undefined || key === null || key === "") return;
  const entry = map.get(key) ?? { value: key, uses: 0, ...extra };
  entry.uses += 1;
  map.set(key, entry);
}

function collect(document, stylesMeta) {
  const bucket = emptyBucket();
  const named = { fill: new Map(), text: new Map(), effect: new Map() };
  const fonts = new Map();

  const walk = (node) => {
    if (node.visible === false) return;
    const styleName = (kind) => (node.styles?.[kind] ? stylesMeta[node.styles[kind]]?.name ?? null : null);

    for (const p of node.fills ?? []) {
      const v = paint(p);
      if (typeof v === "string") {
        add(bucket.colors, v);
        const name = styleName("fill") ?? styleName("fills");
        if (name) add(named.fill, name, { color: v });
      }
    }
    for (const p of node.strokes ?? []) {
      const v = paint(p);
      if (typeof v === "string") add(bucket.colors, v);
    }
    for (const e of node.effects ?? []) {
      if (e.type.includes("SHADOW") && e.visible !== false) {
        const v = effect(e);
        add(bucket.shadows, v);
        const name = styleName("effect");
        if (name) add(named.effect, name, { shadow: v });
      }
    }
    if (node.layoutMode && node.layoutMode !== "NONE") {
      add(bucket.spacing, node.itemSpacing);
      for (const k of ["paddingTop", "paddingRight", "paddingBottom", "paddingLeft"]) add(bucket.spacing, node[k]);
    }
    const radius = radiusOf(node);
    if (radius !== undefined) add(bucket.radii, Array.isArray(radius) ? radius.join(" ") : radius);

    if (node.type === "TEXT" && node.style) {
      const s = node.style;
      const key = `${s.fontFamily} ${s.fontWeight} ${s.fontSize}px/${round(s.lineHeightPx)}px ls ${round(s.letterSpacing ?? 0)}${s.textCase ? " " + s.textCase : ""}`;
      add(bucket.text, key, {
        family: s.fontFamily,
        weight: s.fontWeight,
        size: s.fontSize,
        lineHeight: round(s.lineHeightPx),
        letterSpacing: round(s.letterSpacing ?? 0),
        case: s.textCase,
        sample: (node.characters ?? "").slice(0, 40),
      });
      const name = styleName("text");
      if (name) add(named.text, name, { text: key });
      const font = fonts.get(s.fontFamily) ?? { family: s.fontFamily, weights: new Set(), italic: false };
      font.weights.add(s.fontWeight);
      if (s.italic) font.italic = true;
      fonts.set(s.fontFamily, font);
    }
    for (const child of node.children ?? []) walk(child);
  };
  walk(document);

  const list = (map, numeric = false) =>
    [...map.values()]
      .filter((e) => !numeric || (typeof e.value === "number" ? e.value > 0 : true))
      .sort((a, b) => (numeric && typeof a.value === "number" ? a.value - b.value : b.uses - a.uses));
  return {
    colors: list(bucket.colors),
    text: list(bucket.text),
    spacing: list(bucket.spacing, true),
    radii: list(bucket.radii, true),
    shadows: list(bucket.shadows),
    namedStyles: { fill: list(named.fill), text: list(named.text), effect: list(named.effect) },
    fonts: [...fonts.values()].map((f) => ({ family: f.family, weights: [...f.weights].sort(), italic: f.italic })),
  };
}

function frameInfo(document) {
  const box = document.absoluteBoundingBox;
  const sections = (document.children ?? [])
    .filter((c) => c.visible !== false && c.absoluteBoundingBox)
    .map((c) => {
      const b = c.absoluteBoundingBox;
      const firstChild = (c.children ?? []).find((g) => g.absoluteBoundingBox && g.visible !== false);
      return {
        id: c.id,
        name: c.name,
        type: c.type,
        box: { x: round(b.x - box.x), y: round(b.y - box.y), w: round(b.width), h: round(b.height) },
        padding: c.layoutMode && c.layoutMode !== "NONE" ? [c.paddingTop, c.paddingRight, c.paddingBottom, c.paddingLeft].map((v) => v ?? 0) : undefined,
        gap: c.layoutMode && c.layoutMode !== "NONE" ? c.itemSpacing : undefined,
        firstChildX: firstChild ? round(firstChild.absoluteBoundingBox.x - box.x) : undefined,
        firstChildWidth: firstChild ? round(firstChild.absoluteBoundingBox.width) : undefined,
      };
    });
  return { id: document.id, name: document.name, type: document.type, width: box ? round(box.width) : null, height: box ? round(box.height) : null, sections };
}

async function tokens(refs, options) {
  if (!refs.length) throw new Error("Pass at least one Figma URL (one per breakpoint frame, or a page).");
  const fileKey = refs[0].fileKey;
  if (refs.some((r) => r.fileKey !== fileKey)) throw new Error("All URLs must point to the same Figma file.");

  const vars = await variables(fileKey);
  const frames = [];
  const fonts = new Map();
  let namedStyleCount = 0;

  for (const ref of refs) {
    const raw = await fetchNode(ref);
    // A page or canvas URL: treat each top-level frame as a breakpoint frame.
    const targets = ["CANVAS", "DOCUMENT", "SECTION"].includes(raw.document.type)
      ? (raw.document.children ?? []).filter((c) => c.type === "FRAME" && c.visible !== false)
      : [raw.document];
    for (const target of targets) {
      const data = collect(target, raw.styles);
      namedStyleCount += data.namedStyles.fill.length + data.namedStyles.text.length + data.namedStyles.effect.length;
      for (const f of data.fonts) {
        const known = fonts.get(f.family) ?? { family: f.family, weights: new Set(), italic: false };
        f.weights.forEach((w) => known.weights.add(w));
        known.italic ||= f.italic;
        fonts.set(f.family, known);
      }
      delete data.fonts;
      frames.push({ ...frameInfo(target), ...data });
    }
  }

  const method = [];
  if (vars.status === "ok") method.push("variables");
  if (namedStyleCount) method.push("styles");
  method.push("nodes");

  const result = {
    fileKey,
    extractedAt: new Date().toISOString(),
    urls: refs.map((r) => `${r.fileKey}${r.nodeId ? ` ${r.nodeId}` : ""}`),
    method,
    variablesApi: vars.status === "unavailable" ? vars.reason : vars.status,
    variables: vars.list,
    fonts: [...fonts.values()].map((f) => ({ family: f.family, weights: [...f.weights].sort(), italic: f.italic })),
    frames: frames.sort((a, b) => (a.width ?? 0) - (b.width ?? 0)),
  };
  const out = options.out ?? join(CACHE_DIR, "tokens-raw.json");
  await writeJson(out, result);
  print({
    saved: out,
    method,
    variablesApi: result.variablesApi,
    variables: result.variables.length,
    fonts: result.fonts,
    frames: result.frames.map((f) => ({
      id: f.id,
      name: f.name,
      width: f.width,
      sections: f.sections.length,
      colors: f.colors.length,
      textStyles: f.text.length,
      namedStyles: f.namedStyles.fill.length + f.namedStyles.text.length + f.namedStyles.effect.length,
    })),
  });
}

// ---------- images and assets ----------

async function images(ref, options) {
  const ids = (options.ids ?? ref.nodeId ?? "").split(",").filter(Boolean).map(normalizeId);
  if (!ids.length) throw new Error("Pass a URL with node-id or --ids.");
  const format = options.format ?? "png";
  const scale = Number(options.scale ?? 1);
  const out = options.out ?? "blueprint/reference";
  const urls = await renderUrls(ref.fileKey, ids, { format, scale });
  for (const id of ids) {
    const url = urls[id];
    if (!url) {
      console.error(`No render for ${id} (empty, hidden, or missing node).`);
      continue;
    }
    const file =
      options.file && ids.length === 1 ? options.file : join(out, `${options.name ?? "node"}-${id.replace(/[:;]/g, "-")}.${format}`);
    await download(url, file);
    console.log(`Saved ${file}`);
  }
}

async function fills(ref, options) {
  const { document } = await fetchNode(ref);
  const refs = new Set();
  const walk = (node) => {
    for (const p of node.fills ?? []) if (p.type === "IMAGE" && p.imageRef) refs.add(p.imageRef);
    for (const child of node.children ?? []) walk(child);
  };
  walk(document);
  if (!refs.size) return console.log("No image fills in this node.");
  const data = await api(`/files/${ref.fileKey}/images`, { cache: false });
  const out = options.out ?? "blueprint/reference/fills";
  await mkdir(out, { recursive: true });
  for (const imageRef of refs) {
    const url = data.meta?.images?.[imageRef];
    if (!url) continue;
    const response = await fetch(url);
    if (!response.ok) throw new Error(`Download failed ${response.status} for ${imageRef}`);
    const type = response.headers.get("content-type") ?? "";
    const ext = type.includes("jpeg") ? "jpg" : type.includes("gif") ? "gif" : type.includes("webp") ? "webp" : "png";
    const file = join(out, `${imageRef}.${ext}`);
    await writeFile(file, Buffer.from(await response.arrayBuffer()));
    console.log(`Saved ${file}`);
  }
}

async function exportAssets(ref, options) {
  const ids = (options.ids ?? "").split(",").filter(Boolean).map(normalizeId);
  const names = (options.names ?? "").split(",").filter(Boolean);
  if (!ids.length || ids.length !== names.length) throw new Error("Pass --ids and --names with the same number of entries.");
  const format = options.format ?? "svg";
  const scale = Number(options.scale ?? (format === "svg" ? 1 : 2));
  const out = options.out ?? (format === "svg" && options.component ? "components/icons" : "public/images");
  const urls = await renderUrls(ref.fileKey, ids, { format, scale });
  for (const [i, id] of ids.entries()) {
    const url = urls[id];
    if (!url) {
      console.error(`No render for ${id}.`);
      continue;
    }
    const name = names[i];
    if (format === "svg" && options.component) {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`Download failed ${response.status} for ${name}`);
      const file = join(out, `${name}.tsx`);
      await mkdir(out, { recursive: true });
      await writeFile(file, svgToComponent(await response.text(), name));
      console.log(`Saved ${file}`);
    } else {
      const file = join(out, `${name}.${format}`);
      await download(url, file);
      console.log(`Saved ${file}`);
    }
  }
}

const SVG_ATTRS = {
  class: "className",
  "xlink:href": "xlinkHref",
  "xml:space": "xmlSpace",
  "xmlns:xlink": "xmlnsXlink",
};

function camel(attr) {
  if (SVG_ATTRS[attr]) return SVG_ATTRS[attr];
  if (attr.startsWith("data-") || attr.startsWith("aria-")) return attr;
  return attr.replace(/-([a-z])/g, (_, c) => c.toUpperCase());
}

function svgToComponent(svg, name) {
  const prefix = name.replace(/[^A-Za-z0-9]/g, "").toLowerCase();
  let body = svg.replace(/<\?xml[^>]*>/g, "").replace(/<!--[\s\S]*?-->/g, "").trim();

  // Prefix ids so several icons on one page never share clipPath or gradient ids.
  const ids = [...body.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
  for (const id of ids) {
    body = body
      .replaceAll(`id="${id}"`, `id="${prefix}-${id}"`)
      .replaceAll(`url(#${id})`, `url(#${prefix}-${id})`)
      .replaceAll(`href="#${id}"`, `href="#${prefix}-${id}"`);
  }

  // Clip paths and masks never paint, so their fills neither count as colors nor become currentColor.
  const parts = body.split(/(<(?:clipPath|mask)\b[\s\S]*?<\/(?:clipPath|mask)>)/);
  const visible = parts.filter((_, i) => i % 2 === 0).join("");
  const paints = new Set(
    [...visible.matchAll(/\b(?:fill|stroke)="([^"]+)"/g)].map((m) => m[1].toLowerCase()).filter((v) => v !== "none" && !v.startsWith("url("))
  );
  if (paints.size === 1) {
    const [color] = paints;
    body = parts
      .map((part, i) =>
        i % 2 ? part : part.replace(/\b(fill|stroke)="([^"]+)"/gi, (m, attr, value) => (value.toLowerCase() === color ? `${attr}="currentColor"` : m))
      )
      .join("");
  }

  body = body.replace(/<([a-zA-Z]+)((?:\s+[^\s=>]+="[^"]*")*)\s*(\/?)>/g, (_, tag, attrs, selfClose) => {
    const converted = attrs.replace(/\s+([^\s=>]+)="([^"]*)"/g, (m, attr, value) => ` ${camel(attr)}="${value}"`);
    return `<${tag}${converted}${selfClose ? " /" : ""}>`;
  });

  const open = body.match(/^<svg([^>]*)>/);
  if (!open) throw new Error(`Export for ${name} is not an SVG.`);
  const svgAttrs = open[1].replace(/\s+(width|height)="([\d.]+)"/g, (m, attr, value) => ` ${attr}={${value}}`);
  const inner = body.slice(open[0].length).replace(/<\/svg>\s*$/, "").trim();
  const indented = inner
    .split("\n")
    .map((line) => `      ${line.trim()}`)
    .filter((line) => line.trim())
    .join("\n");

  return `import type { SVGProps } from "react";

type ${name}Props = SVGProps<SVGSVGElement> & { title?: string };

export function ${name}({ title, ...props }: ${name}Props) {
  return (
    <svg${svgAttrs} aria-hidden={title ? undefined : true} role={title ? "img" : undefined} {...props}>
      {title ? <title>{title}</title> : null}
${indented}
    </svg>
  );
}
`;
}

// ---------- snapshot and diff ----------

function snapshotNode(node, origin) {
  const s = simplify(node, origin);
  const strip = (n) => {
    delete n.styleNames;
    delete n.boundVariables;
    if (n.children) n.children = n.children.filter((c) => !c.hidden).map(strip);
    return n;
  };
  return strip(s);
}

async function snapshot(refs, options) {
  if (!refs.length) throw new Error("Pass at least one Figma URL.");
  const frames = [];
  for (const ref of refs) {
    const raw = await fetchNode(ref);
    const targets = ["CANVAS", "DOCUMENT", "SECTION"].includes(raw.document.type)
      ? (raw.document.children ?? []).filter((c) => c.type === "FRAME" && c.visible !== false)
      : [raw.document];
    for (const t of targets) frames.push(snapshotNode(t, t.absoluteBoundingBox ?? { x: 0, y: 0 }));
  }
  const vars = await variables(refs[0].fileKey);
  const result = {
    fileKey: refs[0].fileKey,
    takenAt: new Date().toISOString(),
    variables: vars.list.map((v) => ({ name: v.name, value: v.value })),
    frames,
  };
  const out = options.out ?? join(CACHE_DIR, "snapshot-new.json");
  await writeJson(out, result);
  console.log(`Saved ${out} (${frames.length} frames)`);
}

function index(frames) {
  const map = new Map();
  const walk = (node, frame, path) => {
    map.set(node.id, { node, frame, path: [...path, node.name].join(" / ") });
    for (const child of node.children ?? []) walk(child, frame, [...path, node.name]);
  };
  for (const f of frames) walk(f, `${f.name} [${f.id}]`, []);
  return map;
}

const COMPARED = ["text", "font", "fills", "stroke", "effects", "radius", "layout", "opacity"];

async function diff(oldFile, newFile) {
  if (!oldFile || !newFile) throw new Error("Usage: diff <old.json> <new.json>");
  const before = JSON.parse(await readFile(oldFile, "utf8"));
  const after = JSON.parse(await readFile(newFile, "utf8"));
  const a = index(before.frames);
  const b = index(after.frames);
  const changes = [];

  for (const [id, entry] of b) {
    const old = a.get(id);
    if (!old) {
      changes.push({ kind: "added", id, frame: entry.frame, path: entry.path, type: entry.node.type });
      continue;
    }
    for (const key of COMPARED) {
      const x = JSON.stringify(old.node[key] ?? null);
      const y = JSON.stringify(entry.node[key] ?? null);
      if (x !== y) changes.push({ kind: "changed", id, frame: entry.frame, path: entry.path, property: key, before: old.node[key] ?? null, after: entry.node[key] ?? null });
    }
    if (old.node.box && entry.node.box) {
      for (const k of ["x", "y", "w", "h"]) {
        const delta = round(entry.node.box[k] - old.node.box[k]);
        if (Math.abs(delta) > 2) changes.push({ kind: "changed", id, frame: entry.frame, path: entry.path, property: `box.${k}`, before: old.node.box[k], after: entry.node.box[k] });
      }
    }
  }
  for (const [id, entry] of a) {
    if (!b.has(id)) changes.push({ kind: "removed", id, frame: entry.frame, path: entry.path, type: entry.node.type });
  }

  const oldVars = new Map((before.variables ?? []).map((v) => [v.name, JSON.stringify(v.value)]));
  const newVars = new Map((after.variables ?? []).map((v) => [v.name, JSON.stringify(v.value)]));
  const variableChanges = [];
  for (const [name, value] of newVars) {
    if (!oldVars.has(name)) variableChanges.push({ kind: "added", name, after: JSON.parse(value) });
    else if (oldVars.get(name) !== value) variableChanges.push({ kind: "changed", name, before: JSON.parse(oldVars.get(name)), after: JSON.parse(value) });
  }
  for (const name of oldVars.keys()) if (!newVars.has(name)) variableChanges.push({ kind: "removed", name });

  print({
    before: before.takenAt,
    after: after.takenAt,
    summary: {
      added: changes.filter((c) => c.kind === "added").length,
      removed: changes.filter((c) => c.kind === "removed").length,
      changed: changes.filter((c) => c.kind === "changed").length,
      variables: variableChanges.length,
    },
    variableChanges,
    changes,
  });
}
