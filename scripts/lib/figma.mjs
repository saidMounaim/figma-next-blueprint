// Figma REST API access shared by the figma-next-blueprint scripts. No dependencies (Node 22+).
// Token: FIGMA_TOKEN env var, or a FIGMA_TOKEN=... line in .env at the project root.

import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const API = "https://api.figma.com/v1";
export const CACHE_DIR = "blueprint/.state/figma";
const CACHE_TTL_MS = 15 * 60 * 1000;

let cacheEnabled = true;
export function disableCache() {
  cacheEnabled = false;
}

export function parseUrl(url) {
  if (!url) throw new Error("A Figma URL is required.");
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(`Not a URL: ${url}`);
  }
  const match = parsed.pathname.match(/\/(?:design|file|proto|board)\/([A-Za-z0-9]+)/);
  if (!match) throw new Error(`Not a Figma file URL: ${url} (use a figma.com/design, file, proto, or board link)`);
  const branch = parsed.pathname.match(/\/branch\/([A-Za-z0-9]+)/);
  const nodeParam = parsed.searchParams.get("node-id") ?? parsed.searchParams.get("starting-point-node-id");
  return {
    fileKey: branch ? branch[1] : match[1],
    nodeId: nodeParam ? normalizeId(decodeURIComponent(nodeParam)) : null,
  };
}

// URLs use 12-34 (and I12-34;56-78 for instances); the API uses 12:34.
export function normalizeId(id) {
  return String(id).trim().replaceAll("-", ":");
}

export async function token() {
  if (process.env.FIGMA_TOKEN) return process.env.FIGMA_TOKEN.trim();
  const envPath = resolve(".env");
  if (existsSync(envPath)) {
    const line = (await readFile(envPath, "utf8")).split(/\r?\n/).find((l) => /^\s*FIGMA_TOKEN\s*=/.test(l));
    if (line) return line.slice(line.indexOf("=") + 1).trim().replace(/^["']|["']$/g, "");
  }
  throw new Error(
    "No Figma token. Create one at figma.com > Settings > Security > Personal access tokens " +
      "(file content read-only), then add FIGMA_TOKEN=... to .env in the project root."
  );
}

export class FigmaError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function cached(path) {
  if (!cacheEnabled) return null;
  const file = join(CACHE_DIR, "cache", `${createHash("sha1").update(path).digest("hex")}.json`);
  try {
    const info = await stat(file);
    if (Date.now() - info.mtimeMs > CACHE_TTL_MS) return null;
    return JSON.parse(await readFile(file, "utf8"));
  } catch {
    return null;
  }
}

async function store(path, data) {
  const dir = join(CACHE_DIR, "cache");
  await mkdir(dir, { recursive: true });
  await writeFile(join(dir, `${createHash("sha1").update(path).digest("hex")}.json`), JSON.stringify(data));
}

export async function api(path, { cache = true, attempt = 0 } = {}) {
  if (cache) {
    const hit = await cached(path);
    if (hit) return hit;
  }
  const response = await fetch(`${API}${path}`, { headers: { "X-Figma-Token": await token() } });
  if (response.status === 429 && attempt < 3) {
    const wait = Number(response.headers.get("retry-after") ?? 10);
    console.error(`Figma rate limit, waiting ${wait}s...`);
    await new Promise((r) => setTimeout(r, wait * 1000));
    return api(path, { cache, attempt: attempt + 1 });
  }
  if (response.status === 403) {
    throw new FigmaError(403, "403 from Figma: token invalid, expired, missing a scope, or no access to this file.");
  }
  if (response.status === 404) throw new FigmaError(404, "404 from Figma: file or node not found (check the URL and access).");
  if (!response.ok) throw new FigmaError(response.status, `Figma API ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const data = await response.json();
  if (cache) await store(path, data);
  return data;
}

export async function fetchNode({ fileKey, nodeId }, depth) {
  if (!nodeId) {
    const file = await api(`/files/${fileKey}?depth=${depth ?? 2}`);
    return { document: file.document, styles: file.styles ?? {}, components: file.components ?? {}, name: file.name };
  }
  const nodes = await fetchNodes(fileKey, [nodeId], depth);
  const entry = nodes[nodeId];
  if (!entry) throw new FigmaError(404, `Node ${nodeId} not found in file ${fileKey}.`);
  return entry;
}

// Fetches several nodes in one request. Returns { [id]: { document, styles, components, name } }.
export async function fetchNodes(fileKey, ids, depth) {
  const unique = [...new Set(ids.map(normalizeId))];
  const depthParam = depth ? `&depth=${depth}` : "";
  const data = await api(`/files/${fileKey}/nodes?ids=${encodeURIComponent(unique.join(","))}${depthParam}`);
  const out = {};
  for (const [id, entry] of Object.entries(data.nodes ?? {})) {
    if (entry?.document) {
      out[id] = { document: entry.document, styles: entry.styles ?? {}, components: entry.components ?? {}, name: data.name };
    }
  }
  return out;
}

export const round = (n) => (typeof n === "number" ? Math.round(n * 100) / 100 : n);

export function hex({ r, g, b }) {
  return "#" + [r, g, b].map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("").toUpperCase();
}

// "#RRGGBB" when opaque, "#RRGGBBAA" otherwise.
export function colorValue(color, opacity = 1) {
  const alpha = round((color.a ?? 1) * opacity);
  if (alpha >= 1) return hex(color);
  return hex(color) + Math.round(alpha * 255).toString(16).padStart(2, "0").toUpperCase();
}

export function paint(p) {
  if (!p || p.visible === false) return null;
  if (p.type === "SOLID") return colorValue(p.color, p.opacity ?? 1);
  if (p.type === "IMAGE") return { image: p.imageRef, scaleMode: p.scaleMode };
  if (p.type.startsWith("GRADIENT")) {
    return { gradient: p.type, stops: p.gradientStops.map((s) => `${colorValue(s.color)} ${round(s.position * 100)}%`) };
  }
  return { type: p.type };
}

export function effect(e) {
  if (!e || e.visible === false) return null;
  if (e.type.includes("SHADOW")) {
    const { r, g, b, a } = e.color;
    const rgba = `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${round(a)})`;
    return `${e.type === "INNER_SHADOW" ? "inset " : ""}${round(e.offset.x)}px ${round(e.offset.y)}px ${round(e.radius)}px ${round(e.spread ?? 0)}px ${rgba}`;
  }
  return `${e.type} ${round(e.radius)}px`;
}

export function radiusOf(node) {
  if (node.rectangleCornerRadii) return node.rectangleCornerRadii.map(round);
  if (node.cornerRadius) return round(node.cornerRadius);
  return undefined;
}

// A compact, diff-friendly node tree. Boxes are relative to `origin`.
export function simplify(node, origin, styles = {}, components = {}) {
  const out = { id: node.id, name: node.name, type: node.type };
  if (node.visible === false) out.hidden = true;
  const box = node.absoluteBoundingBox;
  if (box) out.box = { x: round(box.x - origin.x), y: round(box.y - origin.y), w: round(box.width), h: round(box.height) };

  if (node.layoutMode && node.layoutMode !== "NONE") {
    out.layout = {
      mode: node.layoutMode,
      gap: node.itemSpacing,
      padding: [node.paddingTop, node.paddingRight, node.paddingBottom, node.paddingLeft].map((v) => v ?? 0),
      main: node.primaryAxisAlignItems,
      cross: node.counterAxisAlignItems,
      wrap: node.layoutWrap === "WRAP" ? true : undefined,
    };
  }
  if (node.layoutSizingHorizontal) out.sizing = [node.layoutSizingHorizontal, node.layoutSizingVertical];
  const radius = radiusOf(node);
  if (radius !== undefined) out.radius = radius;
  if (node.opacity !== undefined && node.opacity !== 1) out.opacity = round(node.opacity);
  if (node.clipsContent) out.clips = true;

  const fills = (node.fills ?? []).map(paint).filter(Boolean);
  if (fills.length) out.fills = fills;
  const strokes = (node.strokes ?? []).map(paint).filter(Boolean);
  if (strokes.length) out.stroke = { paints: strokes, weight: node.strokeWeight, align: node.strokeAlign };
  const effects = (node.effects ?? []).map(effect).filter(Boolean);
  if (effects.length) out.effects = effects;

  if (node.styles) {
    out.styleNames = Object.fromEntries(Object.entries(node.styles).map(([kind, id]) => [kind, styles[id]?.name ?? id]));
  }
  if (node.boundVariables && Object.keys(node.boundVariables).length) out.boundVariables = Object.keys(node.boundVariables);
  if (node.type === "INSTANCE" && components[node.componentId]) out.component = components[node.componentId].name;

  if (node.type === "TEXT") {
    const s = node.style ?? {};
    out.text = node.characters;
    out.font = {
      family: s.fontFamily,
      weight: s.fontWeight,
      size: s.fontSize,
      lineHeight: s.lineHeightPx ? round(s.lineHeightPx) : undefined,
      letterSpacing: s.letterSpacing ? round(s.letterSpacing) : undefined,
      case: s.textCase,
      decoration: s.textDecoration,
      align: s.textAlignHorizontal,
      autoResize: s.textAutoResize,
      italic: s.italic || undefined,
    };
    if (node.characterStyleOverrides?.some((v) => v !== 0)) out.mixedStyles = true;
  }

  if (node.children?.length) out.children = node.children.map((c) => simplify(c, origin, styles, components));
  return out;
}

export function findById(node, id) {
  if (node.id === id) return node;
  for (const child of node.children ?? []) {
    const hit = findById(child, id);
    if (hit) return hit;
  }
  return null;
}

// Renders nodes and returns { [id]: url|null }. Image URLs expire, so this is never cached.
export async function renderUrls(fileKey, ids, { format = "png", scale = 1 } = {}) {
  const data = await api(
    `/images/${fileKey}?ids=${encodeURIComponent(ids.map(normalizeId).join(","))}&format=${format}&scale=${scale}`,
    { cache: false }
  );
  if (data.err) throw new Error(data.err);
  return data.images ?? {};
}

export async function download(url, file) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Download failed ${response.status} for ${file}`);
  const buffer = Buffer.from(await response.arrayBuffer());
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file, buffer);
  return buffer;
}
