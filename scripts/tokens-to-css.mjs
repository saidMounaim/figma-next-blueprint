#!/usr/bin/env node
// Generates the Figma tokens block in globals.css from blueprint/design/tokens.json.
// No dependencies (Node 22+). Only the text between the markers is ever replaced.

import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, relative, resolve } from "node:path";

const START = "/* figma-tokens:start";
const END = "/* figma-tokens:end */";

const USAGE = `Usage: node scripts/tokens-to-css.mjs [--tokens file] [--css file] [--check] [--print]

  --tokens  default blueprint/design/tokens.json
  --css     default app/globals.css, or src/app/globals.css when that exists
  --check   exit 1 when the block in the CSS file differs from the generated one
  --print   print the generated block without writing`;

// shadcn/ui owns these color names through its own variables; Figma colors map onto them
// through tokens.json "shadcn" instead of redefining them.
const SHADCN_COLORS = [
  "background", "foreground", "card", "card-foreground", "popover", "popover-foreground",
  "primary", "primary-foreground", "secondary", "secondary-foreground", "muted", "muted-foreground",
  "accent", "accent-foreground", "destructive", "destructive-foreground", "border", "input", "ring",
  "chart-1", "chart-2", "chart-3", "chart-4", "chart-5",
  "sidebar", "sidebar-foreground", "sidebar-primary", "sidebar-primary-foreground",
  "sidebar-accent", "sidebar-accent-foreground", "sidebar-border", "sidebar-ring",
];

const NAME = /^[a-z][a-z0-9-]*$/;

function args() {
  const argv = process.argv.slice(2);
  const options = { check: false, print: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--check") options.check = true;
    else if (argv[i] === "--print") options.print = true;
    else if (argv[i] === "--tokens") options.tokens = argv[++i];
    else if (argv[i] === "--css") options.css = argv[++i];
    else if (argv[i] === "--help" || argv[i] === "-h") {
      console.log(USAGE);
      process.exit(0);
    } else throw new Error(`Unknown option ${argv[i]}\n${USAGE}`);
  }
  options.tokens ??= "blueprint/design/tokens.json";
  options.css ??= existsSync("src/app/globals.css") ? "src/app/globals.css" : "app/globals.css";
  return options;
}

const rem = (px) => `${+(px / 16).toFixed(4)}rem`;
const px = (n) => `${+Number(n).toFixed(2)}px`;

function unit(value, convert) {
  if (typeof value === "number") return convert(value);
  if (typeof value === "string") return value;
  throw new Error(`Unsupported token value ${JSON.stringify(value)}`);
}

// A token value is a number, a string passthrough, or { base, <breakpoint>: ... }.
function responsive(value, breakpoints, label) {
  if (value === null || value === undefined) return null;
  if (typeof value !== "object") return { base: value, overrides: {} };
  if (!("base" in value)) throw new Error(`${label}: responsive values need a "base" key (the smallest frame).`);
  const overrides = {};
  for (const [key, v] of Object.entries(value)) {
    if (key === "base") continue;
    if (!breakpoints[key]) throw new Error(`${label}: unknown breakpoint "${key}". Define it under "breakpoints".`);
    overrides[key] = v;
  }
  return { base: value.base, overrides };
}

function checkName(group, name) {
  if (!NAME.test(name)) throw new Error(`${group}.${name}: token names must be lowercase kebab-case.`);
}

// Workflow files are full of example class names (including forbidden ones like bg-[#1D4F91]);
// keep Tailwind's automatic source detection out of them.
const WORKFLOW_SOURCES = ["blueprint", ".claude", ".agents", "scripts", "tools", "AGENTS.md", "CLAUDE.md"];

function generate(tokens, cssFile) {
  const breakpoints = tokens.breakpoints ?? {};
  const theme = [];
  const inline = [];
  const root = [];
  const media = {};
  const push = (bp, line) => (media[bp] ??= []).push(line);

  for (const [name, bp] of Object.entries(breakpoints)) {
    checkName("breakpoints", name);
    if (typeof bp.minWidth !== "number") throw new Error(`breakpoints.${name}.minWidth must be a number of px.`);
    theme.push(`  --breakpoint-${name}: ${rem(bp.minWidth)};`);
  }

  for (const [name, value] of Object.entries(tokens.color ?? {})) {
    checkName("color", name);
    if (SHADCN_COLORS.includes(name)) {
      throw new Error(`color.${name} collides with a shadcn variable. Rename it (for example "brand") and map it in "shadcn".`);
    }
    theme.push(`  --color-${name}: ${value};`);
  }

  for (const [name, font] of Object.entries(tokens.font ?? {})) {
    checkName("font", name);
    const fallback = font.fallback ?? "sans-serif";
    const family = font.variable ? `var(${font.variable})` : `"${font.family}"`;
    inline.push(`  --font-${name}: ${family}, ${fallback};`);
  }

  for (const [name, t] of Object.entries(tokens.text ?? {})) {
    checkName("text", name);
    const parts = [
      ["", t.size, rem],
      ["--line-height", t.lineHeight, rem],
      ["--letter-spacing", t.letterSpacing, rem],
      ["--font-weight", t.weight, String],
    ];
    for (const [suffix, value, convert] of parts) {
      const r = responsive(value, breakpoints, `text.${name}${suffix}`);
      if (!r) continue;
      theme.push(`  --text-${name}${suffix}: ${unit(r.base, convert)};`);
      for (const [bp, v] of Object.entries(r.overrides)) push(bp, `    --text-${name}${suffix}: ${unit(v, convert)};`);
    }
  }

  const scalar = (group, prefix, convert) => {
    for (const [name, value] of Object.entries(tokens[group] ?? {})) {
      checkName(group, name);
      const r = responsive(value, breakpoints, `${group}.${name}`);
      theme.push(`  --${prefix}-${name}: ${unit(r.base, convert)};`);
      for (const [bp, v] of Object.entries(r.overrides)) push(bp, `    --${prefix}-${name}: ${unit(v, convert)};`);
    }
  };
  scalar("spacing", "spacing", rem);
  scalar("container", "container", rem);
  scalar("radius", "radius", px);
  for (const [name, value] of Object.entries(tokens.shadow ?? {})) {
    checkName("shadow", name);
    theme.push(`  --shadow-${name}: ${value};`);
  }

  for (const [variable, target] of Object.entries(tokens.shadcn ?? {})) {
    if (variable === "radius") {
      if (!(target in (tokens.radius ?? {}))) throw new Error(`shadcn.radius points to unknown radius token "${target}".`);
      root.push(`  --radius: var(--radius-${target});`);
      continue;
    }
    if (!SHADCN_COLORS.includes(variable)) throw new Error(`shadcn.${variable} is not a shadcn variable.`);
    if (!(target in (tokens.color ?? {}))) throw new Error(`shadcn.${variable} points to unknown color token "${target}".`);
    root.push(`  --${variable}: var(--color-${target});`);
  }

  const lines = [`${START} - generated by scripts/tokens-to-css.mjs from blueprint/design/tokens.json; do not edit */`];
  const up = relative(dirname(resolve(cssFile)), process.cwd()).replaceAll("\\", "/") || ".";
  for (const source of WORKFLOW_SOURCES) lines.push(`@source not "${up}/${source}";`);
  lines.push("");
  // static: Tailwind would otherwise drop variables no utility uses, breaking the shadcn mapping
  // and the responsive overrides below.
  lines.push("@theme static {", ...theme, "}");
  if (inline.length) lines.push("", "@theme inline {", ...inline, "}");
  if (root.length) lines.push("", ":root {", ...root, "}");
  const ordered = Object.entries(breakpoints).sort((a, b) => a[1].minWidth - b[1].minWidth);
  for (const [bp, def] of ordered) {
    if (!media[bp]) continue;
    lines.push("", `@media (width >= ${rem(def.minWidth)}) {`, "  :root {", ...media[bp], "  }", "}");
  }
  lines.push(END);
  return lines.join("\n");
}

function splice(css, block) {
  const start = css.indexOf(START);
  const end = css.indexOf(END);
  if (start === -1 && end === -1) {
    // Appended last so its :root values win over shadcn's defaults earlier in the file.
    return { css: `${css.trimEnd()}\n\n${block}\n`, existing: null };
  }
  if (start === -1 || end === -1 || end < start || css.indexOf(START, start + 1) !== -1) {
    throw new Error("The figma-tokens markers in the CSS file are broken or duplicated. Fix them by hand first.");
  }
  const existing = css.slice(start, end + END.length);
  return { css: css.slice(0, start) + block + css.slice(end + END.length), existing };
}

async function main() {
  const options = args();
  const tokens = JSON.parse(await readFile(options.tokens, "utf8"));
  const block = generate(tokens, options.css);
  if (options.print) return console.log(block);
  if (!existsSync(options.css)) throw new Error(`${options.css} not found. Pass --css <file>.`);
  const css = (await readFile(options.css, "utf8")).replace(/\r\n/g, "\n");
  const { css: next, existing } = splice(css, block);
  if (options.check) {
    if (existing === block) return console.log(`${options.css}: tokens block is current.`);
    console.error(existing ? `${options.css}: tokens block differs from ${options.tokens}.` : `${options.css}: no tokens block.`);
    process.exit(1);
  }
  if (existing === block) return console.log(`${options.css}: already current.`);
  await writeFile(options.css, next);
  console.log(`${options.css}: ${existing ? "updated" : "added"} the figma-tokens block.`);
}

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});
