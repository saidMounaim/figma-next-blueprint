#!/usr/bin/env node
// npx create-figma-next-blueprint: adds the kit to the root of an existing Next.js project.

import { existsSync } from "node:fs";
import { cp, mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const KIT = resolve(import.meta.dirname, "..");
const ENTRIES = ["AGENTS.md", "CLAUDE.md", ".claude", ".agents", "blueprint"];
// --update replaces only what the kit owns; plans, design data, history, and AGENTS.md stay.
const UPDATABLE = [".claude/skills", ".agents/skills", "blueprint/scripts"];
const NEXT_BLOCKS = /<!-- BEGIN:nextjs-[a-z-]+ -->[\s\S]*?<!-- END:nextjs-[a-z-]+ -->/g;

const USAGE = `Usage: npx create-figma-next-blueprint@latest [project-dir] [--update]

Run it in the root of a Next.js project (default: the current folder).
  (no flag)  add AGENTS.md, CLAUDE.md, .claude/, .agents/, and blueprint/; never overwrites
  --update   replace the kit's skills and helper scripts with this version; keeps your
             plans, design data, history, AGENTS.md, and CLAUDE.md`;

const args = process.argv.slice(2);
if (args.includes("--help") || args.includes("-h")) {
  console.log(USAGE);
  process.exit(0);
}
const update = args.includes("--update");
const dest = resolve(args.find((a) => !a.startsWith("-")) ?? ".");

try {
  await main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exit(1);
}

async function main() {
  const pkgFile = join(dest, "package.json");
  if (!existsSync(pkgFile)) {
    throw new Error(`No package.json in ${dest}. Create the app first: npx create-next-app@latest my-site`);
  }
  const pkg = JSON.parse(await readFile(pkgFile, "utf8"));
  if (!pkg.dependencies?.next && !pkg.devDependencies?.next) {
    throw new Error(`${dest} is not a Next.js project (no "next" dependency).`);
  }
  if (update) return updateKit();
  return install();
}

async function files(path) {
  if (!(await stat(path)).isDirectory()) return [path];
  const out = [];
  for (const entry of await readdir(path)) out.push(...(await files(join(path, entry))));
  return out;
}

async function install() {
  if (existsSync(join(dest, "blueprint", "config.json"))) {
    throw new Error("The kit is already installed here. To get newer skills and scripts, run with --update.");
  }

  // create-next-app writes an AGENTS.md holding only Next.js managed blocks; ours includes them.
  let replaceAgents = false;
  if (existsSync(join(dest, "AGENTS.md"))) {
    const existing = await readFile(join(dest, "AGENTS.md"), "utf8");
    replaceAgents = existing.replace(NEXT_BLOCKS, "").trim() === "";
  }

  const plan = [];
  for (const entry of ENTRIES) {
    for (const file of await files(join(KIT, entry))) plan.push(relative(KIT, file));
  }
  const conflicts = plan.filter((p) => existsSync(join(dest, p)) && !(p === "AGENTS.md" && replaceAgents));
  if (conflicts.length) {
    throw new Error(
      `Nothing was copied. These files already exist:\n- ${conflicts.map((c) => c.replaceAll("\\", "/")).join("\n- ")}\n` +
        "Move them aside and run again."
    );
  }

  for (const entry of ENTRIES) await cp(join(KIT, entry), join(dest, entry), { recursive: true, force: true });
  // npm never publishes .gitignore files, so the generated-state ignore rules are written here.
  await mkdir(join(dest, "blueprint", ".state"), { recursive: true });
  await writeFile(join(dest, "blueprint", ".state", ".gitignore"), "backups/\nstaging/\nrun.json\nfigma/\n");
  console.log(`Added the figma-next-blueprint kit to ${dest}:`);
  ENTRIES.forEach((e) => console.log(`  + ${e}`));
  console.log(`
Next:
  1. npm i -D playwright axe-core
  2. npx playwright install chromium
  3. Add FIGMA_TOKEN=... to .env (in your editor)
  4. Open this folder in Claude Code (or Codex) and run /onboard, then /figma <url>`);
}

async function updateKit() {
  if (!existsSync(join(dest, "blueprint", "config.json"))) {
    throw new Error("The kit is not installed here yet. Run without --update first.");
  }
  for (const path of UPDATABLE) {
    const source = join(KIT, path);
    const target = join(dest, path);
    if (path.endsWith("skills")) {
      // Replace each kit skill folder; skills the user added themselves are left alone.
      for (const skill of await readdir(source)) {
        await rm(join(target, skill), { recursive: true, force: true });
        await cp(join(source, skill), join(target, skill), { recursive: true });
      }
    } else {
      await rm(target, { recursive: true, force: true });
      await cp(source, target, { recursive: true });
    }
    console.log(`  updated ${path}`);
  }

  console.log(`
Your plans, design data, history, AGENTS.md, and CLAUDE.md were not touched. To see what
changed in AGENTS.md, compare yours with
https://github.com/saidMounaim/figma-next-blueprint/blob/main/AGENTS.md
Run /doctor next.`);
}
