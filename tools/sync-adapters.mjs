#!/usr/bin/env node
// Regenerates .agents/skills from .claude/skills. The trees differ only by the Claude Code
// frontmatter line "disable-model-invocation: true", which other adapters do not support.

import { cp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const source = join(root, ".claude", "skills");
const target = join(root, ".agents", "skills");

async function files(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await files(path)));
    else out.push(path);
  }
  return out;
}

await rm(target, { recursive: true, force: true });
await cp(source, target, { recursive: true });
let changed = 0;
for (const file of await files(target)) {
  if (!file.endsWith("SKILL.md")) continue;
  const text = await readFile(file, "utf8");
  const next = text.replace(/^disable-model-invocation: true\r?\n/m, "");
  if (next !== text) {
    await writeFile(file, next);
    changed++;
  }
}
console.log(`Synced .agents/skills from .claude/skills (${changed} SKILL.md files adjusted).`);
