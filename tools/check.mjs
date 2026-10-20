#!/usr/bin/env node
// Maintainer validation for figma-next-blueprint. Exits 1 on any error.

import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const errors = [];
const fail = (message) => errors.push(message);
const rel = (p) => relative(root, p).replaceAll("\\", "/");

async function walk(dir, skip = []) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (skip.includes(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(path, skip)));
    else out.push(path);
  }
  return out;
}

const claude = join(root, ".claude", "skills");
const agents = join(root, ".agents", "skills");
const skills = (await readdir(claude, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort();

// 1. Frontmatter
for (const skill of skills) {
  const file = join(claude, skill, "SKILL.md");
  if (!existsSync(file)) {
    fail(`${skill}: missing SKILL.md`);
    continue;
  }
  const text = (await readFile(file, "utf8")).replace(/\r\n/g, "\n");
  const fm = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!fm) {
    fail(`${skill}: missing frontmatter`);
    continue;
  }
  const name = fm[1].match(/^name: (.+)$/m)?.[1];
  const description = fm[1].match(/^description: (.+)$/m)?.[1];
  if (name !== skill) fail(`${skill}: frontmatter name is "${name}"`);
  if (!description || description.length < 40) fail(`${skill}: description missing or too short`);
  if (description && description.length > 1024) fail(`${skill}: description longer than 1024 characters`);
}

// 2. Adapter trees in sync
if (!existsSync(agents)) fail(".agents/skills missing: run node tools/sync-adapters.mjs");
else {
  const a = (await walk(claude)).map((f) => relative(claude, f)).sort();
  const b = (await walk(agents)).map((f) => relative(agents, f)).sort();
  for (const f of a) if (!b.includes(f)) fail(`.agents/skills/${f.replaceAll("\\", "/")} missing`);
  for (const f of b) if (!a.includes(f)) fail(`.agents/skills/${f.replaceAll("\\", "/")} has no .claude counterpart`);
  for (const f of a.filter((x) => b.includes(x))) {
    const x = (await readFile(join(claude, f), "utf8")).replace(/^disable-model-invocation: true\r?\n/m, "");
    const y = await readFile(join(agents, f), "utf8");
    if (x !== y) fail(`.agents/skills/${f.replaceAll("\\", "/")} differs from .claude: run node tools/sync-adapters.mjs`);
  }
}

// 3. Skill list in AGENTS.md matches the installed skills
const agentsMd = await readFile(join(root, "AGENTS.md"), "utf8");
const listed = [...agentsMd.matchAll(/^- `([a-z0-9-]+)` - /gm)].map((m) => m[1]);
for (const s of skills) if (!agentsMd.includes("`" + s + "`")) fail(`AGENTS.md does not mention skill "${s}"`);
for (const s of listed) if (!skills.includes(s)) fail(`AGENTS.md lists "${s}" but no skill folder exists`);

// 4. Relative references inside skills resolve
for (const file of (await walk(claude)).filter((f) => f.endsWith(".md"))) {
  const text = await readFile(file, "utf8");
  for (const m of text.matchAll(/`((?:\.\.\/[a-z0-9-]+\/)?reference\/[a-z0-9-]+\.md)`/g)) {
    if (!existsSync(join(dirname(file), m[1])) && !existsSync(join(dirname(file), "..", m[1]))) {
      fail(`${rel(file)}: reference ${m[1]} not found`);
    }
  }
  for (const m of text.matchAll(/`(scripts\/[a-z0-9/-]+\.mjs)/g)) {
    if (!existsSync(join(root, m[1]))) fail(`${rel(file)}: ${m[1]} not found`);
  }
}

// 5. Writing rules: no em dash, en dash, or ellipsis character in shipped files
const shipped = (await walk(root, [".git", "node_modules"])).filter((f) => /\.(md|mjs|json)$/.test(f));
for (const file of shipped) {
  const text = await readFile(file, "utf8");
  const bad = text.match(new RegExp(`[${String.fromCodePoint(0x2013, 0x2014, 0x2026)}]`));
  if (bad) fail(`${rel(file)}: contains U+${bad[0].codePointAt(0).toString(16).toUpperCase()}`);
}

// 6. Scripts and JSON parse
for (const file of shipped.filter((f) => f.endsWith(".mjs"))) {
  const r = spawnSync(process.execPath, ["--check", file], { encoding: "utf8" });
  if (r.status !== 0) fail(`${rel(file)}: ${r.stderr.split("\n").find(Boolean)}`);
}
for (const file of shipped.filter((f) => f.endsWith(".json"))) {
  try {
    JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    fail(`${rel(file)}: ${error.message}`);
  }
}

if (errors.length) {
  console.error(`${errors.length} problem(s):\n- ${errors.join("\n- ")}`);
  process.exit(1);
}
console.log(`OK: ${skills.length} skills, adapters in sync, references resolve, ${shipped.length} files clean.`);
