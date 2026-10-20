#!/usr/bin/env node
// Performance report: Lighthouse for mobile and desktop through npx, using Playwright's Chromium.
// Adds nothing to the project's dependencies. Writes to blueprint/reports/perf/.

import { spawnSync } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { chromiumPath } from "./lib/browser.mjs";
import { REPORTS, isLocal, parseFlags, slugFromUrl, stamp, writeJson } from "./lib/report.mjs";

const LIGHTHOUSE = "lighthouse@12.8.2";

const USAGE = `Usage: node scripts/perf.mjs <url> [--form mobile,desktop] [--lighthouse ${LIGHTHOUSE}] [--out dir]

Runs Lighthouse (performance, accessibility, best practices, SEO) per form factor and prints
Core Web Vitals, failing audits with their resources, and JavaScript weight. Measure a
production build (npm run build, then npm run start) or a preview URL, not the dev server.`;

const METRICS = {
  "first-contentful-paint": "FCP",
  "largest-contentful-paint": "LCP",
  "total-blocking-time": "TBT",
  "cumulative-layout-shift": "CLS",
  "speed-index": "Speed Index",
};

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  const { positional, options } = parseFlags(process.argv.slice(2));
  const url = positional[0];
  if (!url) {
    console.log(USAGE);
    process.exit(1);
  }
  new URL(url);
  const forms = (options.form ?? "mobile,desktop").split(",");
  const lighthouse = options.lighthouse ?? LIGHTHOUSE;
  const { day, time } = stamp();
  const outDir = resolve(options.out ?? join(REPORTS, "perf", day, `${time}-${slugFromUrl(url)}`));
  await mkdir(outDir, { recursive: true });
  const devServer = await looksLikeDevServer(url);
  const chrome = chromiumPath();

  const results = [];
  for (const form of forms) {
    const file = join(outDir, `lighthouse-${form}.json`);
    const args = [
      "--yes",
      lighthouse,
      url,
      "--quiet",
      "--output=json",
      `--output-path=${file}`,
      "--only-categories=performance,accessibility,best-practices,seo",
      "--chrome-flags=--headless=new --no-sandbox",
      ...(form === "desktop" ? ["--preset=desktop"] : []),
    ];
    const run = npx(args, { ...process.env, CHROME_PATH: chrome });
    if (run.status !== 0) throw new Error(`Lighthouse (${form}) failed with exit code ${run.status}. Check the URL and that ${lighthouse} can run.`);
    results.push(summarize(form, JSON.parse(await readFile(file, "utf8")), file));
  }

  const out = {
    url,
    createdAt: new Date().toISOString(),
    lighthouse,
    warnings: [
      ...(devServer ? ["This looks like the Next.js dev server. Numbers are not representative; measure npm run build, then npm run start."] : []),
      ...(isLocal(url) ? ["Local runs have no real network or CDN; treat field data from the live site as the final word."] : []),
    ],
    results,
  };
  await writeJson(join(outDir, "summary.json"), out);
  console.log(JSON.stringify({ summary: join(outDir, "summary.json").replaceAll("\\", "/"), ...out }, null, 2));
}

// Node refuses to spawn .cmd files without a shell on Windows, so quote arguments for cmd.exe.
function npx(args, env) {
  if (process.platform !== "win32") return spawnSync("npx", args, { stdio: ["ignore", "inherit", "inherit"], env });
  const quoted = args.map((a) => (/[\s&|<>^"]/.test(a) ? `"${a.replace(/"/g, '\\"')}"` : a));
  return spawnSync(`npx ${quoted.join(" ")}`, { stdio: ["ignore", "inherit", "inherit"], env, shell: true });
}

async function looksLikeDevServer(url) {
  try {
    const html = await (await fetch(url)).text();
    return /data-next-hide-fouc|webpack-hmr|turbopack-hmr|__nextjs_original-stack-frame|react-refresh/i.test(html);
  } catch {
    return false;
  }
}

function firstNode(value) {
  if (!value || typeof value !== "object") return null;
  if (value.type === "node" || value.selector) return value;
  for (const v of Object.values(value)) {
    const hit = firstNode(v);
    if (hit) return hit;
  }
  return null;
}

function summarize(form, lhr, file) {
  const audits = lhr.audits ?? {};
  const categories = Object.fromEntries(Object.entries(lhr.categories ?? {}).map(([k, c]) => [k, Math.round((c.score ?? 0) * 100)]));
  const metrics = Object.fromEntries(
    Object.entries(METRICS).map(([id, label]) => [label, { value: audits[id]?.displayValue ?? null, score: audits[id]?.score ?? null }])
  );
  const lcpNode = firstNode(audits["largest-contentful-paint-element"]?.details);

  const failing = Object.values(audits)
    .filter((a) => !METRICS[a.id] && a.score !== null && a.score < 0.9 && ["numeric", "binary", "metricSavings"].includes(a.scoreDisplayMode))
    .map((a) => {
      const items = a.details?.items ?? [];
      return {
        id: a.id,
        title: a.title,
        display: a.displayValue ?? null,
        savingsMs: a.details?.overallSavingsMs ?? a.metricSavings?.LCP ?? null,
        savingsBytes: a.details?.overallSavingsBytes ?? null,
        items: items
          .map((it) => ({
          url: it.url ?? null,
          selector: firstNode(it)?.selector ?? null,
          label: firstNode(it)?.nodeLabel ?? null,
          wastedBytes: it.wastedBytes ?? null,
          }))
          .filter((it) => it.url || it.selector)
          .slice(0, 5),
      };
    })
    .sort((a, b) => (b.savingsMs ?? 0) - (a.savingsMs ?? 0) || (b.savingsBytes ?? 0) - (a.savingsBytes ?? 0));

  const requests = audits["network-requests"]?.details?.items ?? [];
  const scripts = requests.filter((r) => r.resourceType === "Script");
  const kb = (bytes) => Math.round(bytes / 1024);
  return {
    form,
    file: file.replaceAll("\\", "/"),
    categories,
    metrics,
    lcpElement: lcpNode ? { selector: lcpNode.selector ?? null, label: lcpNode.nodeLabel ?? null } : null,
    javascript: {
      transferKb: kb(scripts.reduce((n, r) => n + (r.transferSize ?? 0), 0)),
      largest: scripts
        .sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0))
        .slice(0, 5)
        .map((r) => ({ url: r.url, kb: kb(r.transferSize ?? 0) })),
    },
    fonts: requests.filter((r) => r.resourceType === "Font").map((r) => ({ url: r.url, kb: kb(r.transferSize ?? 0) })),
    images: requests
      .filter((r) => r.resourceType === "Image")
      .sort((a, b) => (b.transferSize ?? 0) - (a.transferSize ?? 0))
      .slice(0, 5)
      .map((r) => ({ url: r.url, kb: kb(r.transferSize ?? 0) })),
    failing: failing.slice(0, 15),
  };
}
