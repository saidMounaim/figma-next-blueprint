#!/usr/bin/env node
// Copies the figma-next-blueprint overlay into a Next.js project. Never overwrites a file.
// Usage: node tools/install.mjs <project-dir> [--claude-only | --agents-only] [--skip <path>]...

import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";

const kit = resolve(import.meta.dirname, "..");
const args = process.argv.slice(2);
const target = args.find((a) => !a.startsWith("--") && args[args.indexOf(a) - 1] !== "--skip");
const skips = args.flatMap((a, i) => (args[i - 1] === "--skip" ? [a.replaceAll("\\", "/")] : []));

if (!target) {
  console.log("Usage: node tools/install.mjs <project-dir> [--claude-only | --agents-only] [--skip <path>]...");
  process.exit(1);
}
const dest = resolve(target);
const kitFromDest = relative(dest, kit);
if (dest === kit) {
  console.error("That is the kit itself. Pass the path of your Next.js project, for example: node tools/install.mjs ../my-site");
  process.exit(1);
}
if (!kitFromDest.startsWith("..") && !isAbsolute(kitFromDest)) {
  // A clone inside the project becomes a nested Git repo and is scanned by Tailwind and ESLint.
  console.error(
    `The kit is inside your project (${kitFromDest}). Move it next to the project first, then rerun:\n` +
      `  move ${kitFromDest} ..\\figma-next-blueprint   (Windows)\n` +
      `  mv ${kitFromDest} ../figma-next-blueprint      (macOS, Linux)`
  );
  process.exit(1);
}
if (!existsSync(join(dest, "package.json"))) {
  console.error(`${dest} has no package.json. Scaffold the app first: npx create-next-app@latest`);
  process.exit(1);
}
const pkg = JSON.parse(await readFile(join(dest, "package.json"), "utf8"));
if (!pkg.dependencies?.next && !pkg.devDependencies?.next) console.warn("Warning: next is not a dependency of this project.");

const entries = ["AGENTS.md", "CLAUDE.md", ".claude", ".agents", "blueprint", "scripts"].filter((e) => {
  if (args.includes("--claude-only")) return e !== ".agents";
  if (args.includes("--agents-only")) return e !== ".claude" && e !== "CLAUDE.md";
  return true;
});

async function files(path) {
  if (!(await stat(path)).isDirectory()) return [path];
  const out = [];
  for (const entry of await readdir(path)) out.push(...(await files(join(path, entry))));
  return out;
}

const plan = [];
for (const entry of entries) {
  for (const file of await files(join(kit, entry))) {
    const relPath = relative(kit, file).replaceAll("\\", "/");
    if (skips.some((s) => relPath === s || relPath.startsWith(`${s}/`))) continue;
    plan.push(relPath);
  }
}

// create-next-app and `next dev` write an AGENTS.md holding only marker-delimited managed blocks.
// Those blocks are kept and appended to ours; any other existing content is a real conflict.
const MANAGED = /<!-- BEGIN:nextjs-[a-z-]+ -->[\s\S]*?<!-- END:nextjs-[a-z-]+ -->/g;
let nextBlocks = null;
if (plan.includes("AGENTS.md") && existsSync(join(dest, "AGENTS.md"))) {
  const existing = await readFile(join(dest, "AGENTS.md"), "utf8");
  if (existing.replace(MANAGED, "").trim() === "") nextBlocks = existing.match(MANAGED) ?? [];
}

const conflicts = plan.filter((p) => existsSync(join(dest, p)) && !(p === "AGENTS.md" && nextBlocks));
if (conflicts.length) {
  console.error(`Nothing copied. These files already exist in ${dest}:\n- ${conflicts.join("\n- ")}`);
  console.error("Move or merge them first, or pass --skip <path> for each one you want to keep.");
  process.exit(1);
}

for (const p of plan) {
  await mkdir(dirname(join(dest, p)), { recursive: true });
  if (p === "AGENTS.md" && nextBlocks) {
    const ours = (await readFile(join(kit, p), "utf8")).trimEnd();
    await writeFile(join(dest, p), [ours, ...nextBlocks].join("\n\n") + "\n");
    continue;
  }
  await cp(join(kit, p), join(dest, p));
}
console.log(`Copied ${plan.length} files into ${dest}.`);
if (nextBlocks?.length) console.log("Kept the Next.js managed block(s) from the existing AGENTS.md at the end of the new one.");
console.log("Next: add FIGMA_TOKEN=... to .env, open the project in your AI tool, and run /onboard.");
