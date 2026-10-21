#!/usr/bin/env node
// Accessibility report: axe-core at each breakpoint plus a keyboard pass. Read-only on app code.
// Needs playwright and axe-core (devDependencies). Writes to blueprint/reports/a11y/.

import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { axeSource, launch, openPage } from "./lib/browser.mjs";
import { REPORTS, parseFlags, slugFromUrl, stamp, writeJson } from "./lib/report.mjs";

const USAGE = `Usage: node blueprint/scripts/a11y.mjs <url> [--widths 375,768,1440] [--tabs 80] [--out dir]

Runs axe-core (WCAG 2.2 A/AA plus best practices) at each width, then a keyboard pass at the
smallest and largest width: tab order, visible focus, focus traps, and expand/collapse controls.
Widths default to blueprint/design/map.json, else 375,768,1440.`;

const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"];

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
  const map = existsSync("blueprint/design/map.json") ? JSON.parse(await readFile("blueprint/design/map.json", "utf8")) : null;
  const widths = options.widths ? options.widths.split(",").map(Number) : map?.widths ?? [375, 768, 1440];
  const maxTabs = Number(options.tabs ?? 80);
  const { day, time } = stamp();
  const outDir = options.out ?? join(REPORTS, "a11y", day, `${time}-${slugFromUrl(url)}`);
  const axe = axeSource();
  const components = Object.fromEntries(Object.entries(map?.sections ?? {}).map(([k, s]) => [k, s.component ?? null]));

  const browser = await launch();
  const widthsOut = [];
  try {
    const keyboardWidths = new Set([Math.min(...widths), Math.max(...widths)]);
    for (const width of widths) {
      const { context, page, status, errors } = await openPage(browser, url, width);
      try {
        await page.addScriptTag({ content: axe });
        const raw = await page.evaluate(
          (tags) => window.axe.run(document, { runOnly: { type: "tag", values: tags }, resultTypes: ["violations", "incomplete"] }),
          TAGS
        );
        const violations = await describe(page, raw.violations, components);
        const incomplete = await describe(page, raw.incomplete, components);
        const keyboard = keyboardWidths.has(width) ? await keyboardPass(page, maxTabs, components) : null;
        widthsOut.push({ width, status, consoleErrors: errors, violations, incomplete, keyboard });
      } finally {
        await context.close();
      }
    }
  } finally {
    await browser.close();
  }

  const count = (impact) => widthsOut.reduce((n, w) => n + w.violations.filter((v) => v.impact === impact).length, 0);
  const keyboardIssues = widthsOut.reduce((n, w) => n + (w.keyboard?.issues.length ?? 0), 0);
  const result = {
    url,
    createdAt: new Date().toISOString(),
    widths,
    summary: { critical: count("critical"), serious: count("serious"), moderate: count("moderate"), minor: count("minor"), keyboardIssues },
    verdict: count("critical") + count("serious") + keyboardIssues ? "fail" : "pass",
    results: widthsOut,
  };
  await writeJson(join(outDir, "results.json"), result);
  console.log(
    JSON.stringify(
      {
        verdict: result.verdict,
        results: join(outDir, "results.json").replaceAll("\\", "/"),
        summary: result.summary,
        violations: widthsOut.map((w) => ({ width: w.width, rules: w.violations.map((v) => `${v.impact} ${v.id} (${v.nodes.length})`) })),
      },
      null,
      2
    )
  );
}

async function describe(page, items, components) {
  const out = [];
  for (const item of items) {
    const nodes = [];
    for (const node of item.nodes.slice(0, 10)) {
      const selector = node.target[0];
      const where = typeof selector === "string"
        ? await page.evaluate((sel) => {
            const el = document.querySelector(sel);
            return {
              section: el?.closest("[data-section]")?.getAttribute("data-section") ?? null,
              element: el?.closest("[data-el]")?.getAttribute("data-el") ?? null,
            };
          }, selector).catch(() => ({ section: null, element: null }))
        : { section: null, element: null };
      nodes.push({
        target: node.target.join(" "),
        html: node.html.slice(0, 200),
        summary: (node.failureSummary ?? "").split("\n").slice(0, 3).join(" "),
        section: where.section,
        element: where.element,
        file: where.section ? components[where.section] ?? null : null,
      });
    }
    out.push({ id: item.id, impact: item.impact, help: item.help, helpUrl: item.helpUrl, total: item.nodes.length, nodes });
  }
  return out;
}

async function keyboardPass(page, maxTabs, components) {
  const issues = [];
  const order = [];
  await page.evaluate(() => {
    window.scrollTo(0, 0);
    document.activeElement?.blur?.();
  });

  let first = null;
  let repeats = 0;
  let last = null;
  for (let i = 0; i < maxTabs; i++) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body || el === document.documentElement) return null;
      if (!el.dataset.a11yIndex) el.dataset.a11yIndex = String(document.querySelectorAll("[data-a11y-index]").length + 1);
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const indicator =
        (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== "none");
      return {
        key: el.dataset.a11yIndex,
        tag: el.tagName.toLowerCase(),
        name: (el.getAttribute("aria-label") || el.innerText || el.getAttribute("title") || "").trim().replace(/\s+/g, " ").slice(0, 60),
        section: el.closest("[data-section]")?.getAttribute("data-section") ?? null,
        element: el.closest("[data-el]")?.getAttribute("data-el") ?? null,
        visible: r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && cs.opacity !== "0",
        indicator,
      };
    });
    if (!info) {
      if (first) break;
      continue;
    }
    if (first && info.key === first) break;
    first ??= info.key;
    if (info.key === last) {
      repeats++;
      if (repeats >= 3) {
        issues.push({ check: "focus-trap", detail: `Focus stuck on <${info.tag}> "${info.name}"`, section: info.section, file: components[info.section] ?? null });
        break;
      }
      continue;
    }
    repeats = 0;
    last = info.key;
    order.push({ tag: info.tag, name: info.name, section: info.section, element: info.element });
    if (!info.visible) issues.push({ check: "focus-invisible-element", detail: `<${info.tag}> "${info.name}" receives focus while hidden`, section: info.section, file: components[info.section] ?? null });
    else if (!info.indicator) issues.push({ check: "focus-indicator", detail: `<${info.tag}> "${info.name}" has no visible focus style`, section: info.section, file: components[info.section] ?? null });
  }

  const toggles = await page.$$("button[aria-expanded='false'], [role='button'][aria-expanded='false']");
  for (const toggle of toggles.slice(0, 5)) {
    if (!(await toggle.isVisible())) continue;
    const label = ((await toggle.getAttribute("aria-label")) ?? (await toggle.innerText())).trim().slice(0, 60);
    const section = await toggle.evaluate((el) => el.closest("[data-section]")?.getAttribute("data-section") ?? null);
    await toggle.focus();
    await page.keyboard.press("Enter");
    await page.waitForTimeout(250);
    const opened = (await toggle.getAttribute("aria-expanded")) === "true" || (await page.$("[role='dialog']:visible")) !== null;
    if (!opened) {
      issues.push({ check: "toggle-enter", detail: `"${label}" does not open with Enter (aria-expanded stays false)`, section, file: components[section] ?? null });
      continue;
    }
    await page.keyboard.press("Escape");
    await page.waitForTimeout(250);
    const closed = (await toggle.getAttribute("aria-expanded")) !== "true";
    const focusBack = await toggle.evaluate((el) => document.activeElement === el);
    if (!closed) issues.push({ check: "toggle-escape", detail: `"${label}" does not close with Escape`, section, file: components[section] ?? null });
    else if (!focusBack) issues.push({ check: "toggle-focus-return", detail: `Focus does not return to "${label}" after Escape`, section, file: components[section] ?? null });
  }

  return { stops: order.length, order, issues };
}
