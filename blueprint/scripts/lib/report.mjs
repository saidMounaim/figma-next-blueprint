// Report helpers shared by the figma-next-blueprint scripts. No dependencies.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, statSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

export const REPORTS = "blueprint/reports";

// Paths that never change what the site renders. Edits here must not make a pixel pass stale.
const WORKFLOW_PATHS = ["blueprint/", ".claude/", ".agents/", "AGENTS.md", "CLAUDE.md", "test-results/"];

export function stamp(date = new Date()) {
  const pad = (n) => String(n).padStart(2, "0");
  return {
    day: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    time: `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  };
}

export function slugFromUrl(url) {
  const path = new URL(url).pathname.replace(/\/+$/, "");
  return path ? path.slice(1).replace(/[^a-z0-9]+/gi, "-").toLowerCase() : "home";
}

export function isLocal(url) {
  const host = new URL(url).hostname;
  return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host.endsWith(".local");
}

function git(args, input) {
  return execFileSync("git", args, { encoding: "utf8", input, maxBuffer: 64 * 1024 * 1024, stdio: ["pipe", "pipe", "ignore"] });
}

// Content hash of every tracked or untracked, non-ignored product file. Independent of commits,
// so a checkpoint commit does not make a pass stale, but any product edit does.
export function sourceFingerprint() {
  try {
    const head = git(["rev-parse", "HEAD"]).trim();
    const files = git(["ls-files", "-co", "--exclude-standard", "-z"])
      .split("\0")
      .filter(Boolean)
      .filter((f) => !WORKFLOW_PATHS.some((p) => (p.endsWith("/") ? f.startsWith(p) : f === p)))
      .filter((f) => existsSync(f) && statSync(f).isFile())
      .sort();
    const shas = files.length ? git(["hash-object", "--stdin-paths"], files.join("\n") + "\n").trim().split("\n") : [];
    const hash = createHash("sha256");
    files.forEach((f, i) => hash.update(`${f}\t${shas[i]}\n`));
    return { head, sourceHash: hash.digest("hex"), files: files.length };
  } catch {
    return { head: null, sourceHash: null, files: 0 };
  }
}

export async function writeJson(file, value) {
  await mkdir(resolve(file, ".."), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2) + "\n");
}

export function mdTable(columns, rows) {
  const esc = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\n/g, " ");
  return [
    `| ${columns.join(" | ")} |`,
    `| ${columns.map(() => "---").join(" | ")} |`,
    ...rows.map((r) => `| ${r.map(esc).join(" | ")} |`),
  ].join("\n");
}

export function parseFlags(argv, booleans = []) {
  const positional = [];
  const options = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (!arg.startsWith("--")) positional.push(arg);
    else if (booleans.includes(arg.slice(2))) options[arg.slice(2)] = true;
    else options[arg.slice(2)] = argv[++i];
  }
  return { positional, options };
}
