// Loads Playwright from the project's own node_modules, with setup hints instead of stack traces.

import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const projectRequire = createRequire(join(process.cwd(), "package.json"));

export function loadPlaywright() {
  try {
    return projectRequire("playwright");
  } catch {
    throw new Error(
      "Playwright is not installed in this project. Run: npm i -D playwright, then npx playwright install chromium"
    );
  }
}

export async function launch() {
  const { chromium } = loadPlaywright();
  try {
    return await chromium.launch();
  } catch (error) {
    if (/Executable doesn't exist|browserType\.launch/i.test(error.message)) {
      throw new Error("Playwright's Chromium is missing. Run: npx playwright install chromium");
    }
    throw error;
  }
}

export function chromiumPath() {
  const { chromium } = loadPlaywright();
  const path = chromium.executablePath();
  if (!path || !existsSync(path)) throw new Error("Playwright's Chromium is missing. Run: npx playwright install chromium");
  return path;
}

export function axeSource() {
  try {
    return readFileSync(projectRequire.resolve("axe-core/axe.min.js"), "utf8");
  } catch {
    throw new Error("axe-core is not installed in this project. Run: npm i -D axe-core");
  }
}

// Stable rendering for measurements: no animations, transitions, carets, or classic scrollbars.
export const STABLE_CSS = `
*, *::before, *::after { animation: none !important; transition: none !important; caret-color: transparent !important; }
html { scrollbar-width: none !important; }
::-webkit-scrollbar { display: none !important; }
`;

export async function openPage(browser, url, width, { height = 900 } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && errors.push(`console: ${m.text()}`));
  let response;
  try {
    response = await page.goto(url, { waitUntil: "networkidle", timeout: 45000 });
  } catch (error) {
    if (/ERR_CONNECTION_REFUSED|ECONNREFUSED/.test(error.message)) {
      await context.close();
      throw new Error(`${url} is not reachable. Start the app (for example npm run dev) and retry.`);
    }
    response = await page.goto(url, { waitUntil: "load", timeout: 45000 });
  }
  await page.addStyleTag({ content: STABLE_CSS });
  await settle(page);
  return { context, page, status: response?.status() ?? null, errors };
}

// Scroll through the page so lazy images load, then wait for fonts and images.
export async function settle(page) {
  await page.evaluate(async () => {
    const step = window.innerHeight;
    for (let y = 0; y < document.documentElement.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
    await document.fonts.ready;
    await Promise.all(
      [...document.images].filter((img) => !img.complete).map((img) => new Promise((r) => { img.onload = img.onerror = r; }))
    );
  });
  await page.waitForTimeout(150);
}
