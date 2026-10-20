#!/usr/bin/env node
// On-page SEO checker for figma-next-blueprint sites. No dependencies (Node 22+).
// Read-only: it only sends GET and HEAD requests to the site you name.

import { parseFlags } from "./lib/report.mjs";

const USAGE = `Usage: node scripts/seo.mjs <command> <url> [options]

Commands:
  site   <site-url>                          robots.txt, sitemap.xml, search visibility
  check  <url> [<url> ...] [--links]         check pages; --links also checks internal link status
  crawl  <start-url> [--limit 50] [--links]  follow internal links and sitemap URLs, respecting
                                             robots.txt, then check every page found

Output is JSON. Severities: error, warning, info.`;

// Crawler-like UA so Next.js renders blocking metadata in <head>, as search engines see it.
const UA = "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html) figma-next-blueprint-seo/1.0";
const ROBOTS_AGENT = "figma-next-blueprint-seo";
const MAX_REDIRECTS = 5;
const MAX_LINKS = 300;

main().catch((error) => {
  console.error(`Error: ${error.message}`);
  process.exit(1);
});

async function main() {
  const [command, ...rest] = process.argv.slice(2);
  const { positional: urls, options } = parseFlags(rest, ["links"]);
  const flags = { links: Boolean(options.links), limit: Number(options.limit ?? 50) };
  if (!command || !urls.length) {
    console.log(USAGE);
    process.exit(command ? 1 : 0);
  }
  urls.forEach((u) => new URL(u));

  let result;
  if (command === "site") result = await site(urls[0]);
  else if (command === "check") result = await checkPages(urls, flags.links);
  else if (command === "crawl") result = await crawl(urls[0], flags);
  else {
    console.log(USAGE);
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

// ---------- HTTP ----------

async function get(url, method = "GET") {
  const chain = [];
  let current = url;
  for (let i = 0; i <= MAX_REDIRECTS; i++) {
    const response = await fetch(current, { method, redirect: "manual", headers: { "user-agent": UA } });
    if (response.status >= 300 && response.status < 400 && response.headers.get("location")) {
      chain.push({ from: current, status: response.status });
      current = new URL(response.headers.get("location"), current).href;
      continue;
    }
    const body = method === "GET" ? await response.text() : "";
    return { url: current, status: response.status, headers: response.headers, body, redirects: chain };
  }
  throw new Error(`Too many redirects from ${url}`);
}

// ---------- HTML parsing (enough for server-rendered Next.js output) ----------

function decode(text) {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&nbsp;/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function textOf(html) {
  return decode(html.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

function attrs(source) {
  const out = {};
  const re = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
  let m;
  while ((m = re.exec(source))) out[m[1].toLowerCase()] = decode(m[2] ?? m[3] ?? m[4] ?? "");
  return out;
}

function tags(html, name) {
  const re = new RegExp(`<${name}\\b([^>]*)>`, "gi");
  return [...html.matchAll(re)].map((m) => attrs(m[1]));
}

function parse(raw) {
  const jsonLd = [...raw.matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map((m) => m[1].trim());

  const html = raw
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|template)\b[\s\S]*?<\/\1>/gi, "");
  // Next.js may stream metadata into <body> for some clients, so read tags from the whole
  // document, but ignore <title> inside inline SVG icons.
  const withoutSvg = html.replace(/<svg\b[\s\S]*?<\/svg>/gi, "");
  const metas = tags(html, "meta");
  const linkTags = tags(html, "link");
  const meta = (key, value) => metas.find((m) => (m[key] ?? "").toLowerCase() === value)?.content ?? null;
  const body = (html.match(/<body\b[\s\S]*<\/body>/i) ?? [html])[0];

  return {
    lang: tags(html, "html")[0]?.lang ?? null,
    titles: [...withoutSvg.matchAll(/<title\b[^>]*>([\s\S]*?)<\/title>/gi)].map((m) => textOf(m[1])),
    description: meta("name", "description"),
    robots: meta("name", "robots"),
    viewport: meta("name", "viewport"),
    canonicals: linkTags.filter((l) => (l.rel ?? "").toLowerCase() === "canonical").map((l) => l.href),
    icon: linkTags.some((l) => /(^|\s)icon(\s|$)/i.test(l.rel ?? "")),
    og: {
      title: meta("property", "og:title"),
      description: meta("property", "og:description"),
      image: meta("property", "og:image"),
      url: meta("property", "og:url"),
    },
    twitter: {
      card: meta("name", "twitter:card"),
      title: meta("name", "twitter:title"),
      description: meta("name", "twitter:description"),
      image: meta("name", "twitter:image"),
    },
    headings: [...body.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)].map((m) => ({ level: Number(m[1]), text: textOf(m[2]) })),
    images: tags(body, "img"),
    links: [...body.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].map((m) => {
      const a = attrs(m[1]);
      const imgAlt = tags(m[2], "img").map((i) => i.alt ?? "").join(" ").trim();
      const svgTitle = (m[2].match(/<title\b[^>]*>([\s\S]*?)<\/title>/i) ?? [])[1];
      return { href: a.href ?? null, rel: a.rel ?? "", text: textOf(m[2].replace(/<svg\b[\s\S]*?<\/svg>/gi, "")) || a["aria-label"] || a.title || imgAlt || (svgTitle ? textOf(svgTitle) : "") };
    }),
    jsonLd,
  };
}

// ---------- robots.txt ----------

function parseRobots(body) {
  const groups = [];
  let current = null;
  for (const raw of body.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const [, key, value] = m;
    const k = key.toLowerCase();
    if (k === "user-agent") {
      if (!current || current.rules.length) groups.push((current = { agents: [], rules: [] }));
      current.agents.push(value.toLowerCase());
    } else if ((k === "allow" || k === "disallow") && current) {
      current.rules.push({ allow: k === "allow", path: value });
    }
  }
  const group =
    groups.find((g) => g.agents.some((a) => a !== "*" && ROBOTS_AGENT.includes(a))) ?? groups.find((g) => g.agents.includes("*"));
  const rules = (group?.rules ?? []).filter((r) => r.path !== "");
  const toRegex = (p) => new RegExp("^" + p.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
  return {
    sitemaps: [...body.matchAll(/^\s*Sitemap:\s*(\S+)/gim)].map((m) => m[1]),
    allowed(path) {
      let best = null;
      for (const r of rules) {
        if (toRegex(r.path).test(path) && (!best || r.path.length > best.path.length || (r.path.length === best.path.length && r.allow))) best = r;
      }
      return !best || best.allow;
    },
    disallowAll: rules.some((r) => !r.allow && r.path === "/"),
  };
}

async function robotsFor(origin) {
  const res = await get(new URL("/robots.txt", origin).href).catch(() => null);
  return { status: res?.status ?? null, robots: parseRobots(res?.status === 200 ? res.body : "") };
}

// ---------- site ----------

async function site(siteUrl) {
  const origin = new URL(siteUrl).origin;
  const issues = [];
  const add = (severity, check, found, expected, fix) => issues.push({ severity, check, found, expected, fix });

  const { status, robots } = await robotsFor(origin);
  if (status !== 200) add("warning", "robots-txt", `HTTP ${status}`, "robots.txt returns 200", "app/robots.ts");
  if (robots.disallowAll) add("error", "robots-disallow-all", "Disallow: / for all crawlers", "Crawlers allowed on the live site", "app/robots.ts");
  if (status === 200 && !robots.sitemaps.length) add("warning", "robots-sitemap", "No Sitemap line", "Sitemap: <origin>/sitemap.xml", "app/robots.ts (sitemap)");

  const sitemapUrl = robots.sitemaps[0] ?? new URL("/sitemap.xml", origin).href;
  const sm = await get(sitemapUrl).catch(() => null);
  let sitemapCount = 0;
  if (!sm || sm.status !== 200 || !/<(urlset|sitemapindex)\b/i.test(sm.body)) {
    add("error", "sitemap", `${sitemapUrl}: ${sm ? `HTTP ${sm.status}` : "no response"}`, "A valid XML sitemap", "app/sitemap.ts");
  } else {
    const locs = [...sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => decode(m[1]));
    sitemapCount = locs.length;
    const foreign = locs.filter((l) => new URL(l).origin !== origin);
    if (foreign.length) {
      add("info", "sitemap-origin", `${foreign.length} URLs on ${new URL(foreign[0]).origin}`, `URLs on ${origin} (expected locally when metadataBase is the production domain)`, "app/sitemap.ts, metadataBase in app/layout.tsx");
    }
    if (!locs.length) add("warning", "sitemap-empty", "No <loc> entries", "Every public page listed", "app/sitemap.ts");
  }

  const home = await get(new URL("/", origin).href);
  const parsed = parse(home.body);
  const noindex = /noindex/i.test(`${parsed.robots ?? ""} ${home.headers.get("x-robots-tag") ?? ""}`);
  if (noindex) add("error", "search-visibility", "Home page is noindex", "Indexable on the live site", "robots in metadata (app/layout.tsx) or middleware headers");

  return { site: origin, homeStatus: home.status, robotsTxt: status, sitemap: sitemapUrl, sitemapUrls: sitemapCount, searchVisible: !noindex, issues };
}

// ---------- crawl ----------

async function crawl(start, { limit, links }) {
  const origin = new URL(start).origin;
  const { robots } = await robotsFor(origin);
  const queue = [normalize(start)];
  const seen = new Set(queue);
  const skipped = [];

  const sitemapUrl = robots.sitemaps[0] ?? new URL("/sitemap.xml", origin).href;
  const sm = await get(sitemapUrl).catch(() => null);
  if (sm?.status === 200) {
    for (const m of sm.body.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)) {
      // Sitemaps built from metadataBase point at production; check the same paths on this origin.
      const u = new URL(decode(m[1]));
      const local = normalize(new URL(u.pathname + u.search, origin).href);
      if (!seen.has(local)) {
        seen.add(local);
        queue.push(local);
      }
    }
  }

  const pages = [];
  while (queue.length && pages.length < limit) {
    const url = queue.shift();
    const path = new URL(url).pathname;
    if (!robots.allowed(path)) {
      skipped.push({ url, reason: "disallowed by robots.txt" });
      continue;
    }
    const result = await checkPage(url);
    pages.push(result);
    for (const href of result.internalLinks ?? []) {
      const n = normalize(href);
      if (!seen.has(n) && !/\.(png|jpe?g|gif|webp|avif|svg|pdf|zip|xml|txt|ico)$/i.test(new URL(n).pathname)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  const notChecked = queue.length;
  const result = await finish(pages, links);
  return { start, limit, pagesChecked: pages.length, notChecked, skipped, ...result };
}

// ---------- check ----------

async function checkPages(urls, withLinks) {
  const pages = [];
  for (const url of urls) pages.push(await checkPage(url));
  return finish(pages, withLinks);
}

async function finish(pages, withLinks) {
  const duplicates = [];
  for (const field of ["title", "description"]) {
    const seen = new Map();
    pages.forEach((r) => {
      const value = r.data?.[field];
      if (value) seen.set(value, [...(seen.get(value) ?? []), r.url]);
    });
    for (const [value, list] of seen) {
      if (list.length > 1) {
        duplicates.push({ severity: "warning", check: `duplicate-${field}`, value, pages: list, fix: "generateMetadata of each route, or title.template in app/layout.tsx" });
      }
    }
  }

  const broken = [];
  let linksChecked = 0;
  if (withLinks) {
    const internal = new Set();
    pages.forEach((r) => (r.internalLinks ?? []).forEach((href) => internal.size < MAX_LINKS && internal.add(href)));
    linksChecked = internal.size;
    for (const href of internal) {
      let res = await get(href, "HEAD").catch(() => null);
      if (!res || res.status === 405) res = await get(href).catch(() => null);
      if (!res || res.status >= 400) {
        const on = pages.filter((r) => r.internalLinks?.includes(href)).map((r) => r.url);
        broken.push({ severity: "error", check: "broken-link", href, status: res?.status ?? "no response", on, fix: "the component or content that renders the link" });
      }
    }
  }
  pages.forEach((r) => delete r.internalLinks);
  return { pages, duplicates, linksChecked, brokenLinks: broken, summary: summary(pages, duplicates, broken) };
}

function summary(pages, duplicates, broken) {
  const count = (sev) =>
    pages.reduce((n, r) => n + r.issues.filter((i) => i.severity === sev).length, 0) + [...duplicates, ...broken].filter((i) => i.severity === sev).length;
  return { pages: pages.length, errors: count("error"), warnings: count("warning"), info: count("info") };
}

async function checkPage(url) {
  const issues = [];
  const add = (severity, check, found, expected, fix) => issues.push({ severity, check, found, expected, fix });

  let res;
  try {
    res = await get(url);
  } catch (error) {
    return { url, status: null, issues: [{ severity: "error", check: "fetch", found: error.message, expected: "Page loads" }] };
  }
  if (res.status !== 200) add("error", "http-status", `HTTP ${res.status}`, "200", "the route's page.tsx, or notFound() for missing content");
  if (res.redirects.length) add("warning", "redirect", `${url} -> ${res.url}`, "Link to the final URL directly", "the link source or next.config redirects");
  if (!/text\/html/i.test(res.headers.get("content-type") ?? "")) return { url, status: res.status, issues };

  const p = parse(res.body);
  const finalUrl = res.url;
  const title = p.titles[0] ?? null;
  const meta = "metadata or generateMetadata in the route's page.tsx (defaults in app/layout.tsx)";

  if (!p.lang) add("error", "html-lang", "Missing", "<html lang>", "app/layout.tsx");
  if (!p.viewport) add("error", "viewport", "Missing", '<meta name="viewport">', "app/layout.tsx (viewport export)");
  if (!title) add("error", "title", "Missing", "A page title", meta);
  else if (title.length < 30 || title.length > 60) add("warning", "title-length", `${title.length} chars: "${title}"`, "30-60 characters", meta);
  if (p.titles.length > 1) add("error", "title-multiple", `${p.titles.length} <title> tags`, "Exactly one", "a manual <title> or <head> in a component");

  if (!p.description) add("warning", "meta-description", "Missing", "A unique description per page", meta);
  else if (p.description.length < 70 || p.description.length > 160) add("warning", "meta-description-length", `${p.description.length} chars`, "70-160 characters", meta);

  const xRobots = res.headers.get("x-robots-tag") ?? "";
  if (/noindex/i.test(`${p.robots ?? ""} ${xRobots}`)) add("error", "noindex", p.robots ?? `X-Robots-Tag: ${xRobots}`, "Indexable (unless intentional)", "robots in metadata, or headers in next.config / middleware");
  else if (/nofollow/i.test(p.robots ?? "")) add("warning", "nofollow", p.robots, "Links followed", "robots in metadata");

  if (!p.canonicals.length) add("warning", "canonical", "Missing", '<link rel="canonical"> to this URL', "alternates.canonical in metadata, with metadataBase in app/layout.tsx");
  else if (p.canonicals.length > 1) add("error", "canonical-multiple", `${p.canonicals.length} canonical tags`, "Exactly one", meta);
  else if (new URL(p.canonicals[0], finalUrl).pathname.replace(/\/$/, "") !== new URL(finalUrl).pathname.replace(/\/$/, "")) {
    add("warning", "canonical-target", p.canonicals[0], `${new URL(finalUrl).pathname} (unless intentional)`, meta);
  }

  const ogMissing = Object.entries(p.og).filter(([, v]) => !v).map(([k]) => `og:${k}`);
  if (ogMissing.length) add("warning", "open-graph", `Missing ${ogMissing.join(", ")}`, "og:title, og:description, og:image, og:url", "openGraph in metadata, or app/opengraph-image");
  if (!p.twitter.card) add("warning", "twitter-card", "Missing", '<meta name="twitter:card">', "twitter in metadata (app/layout.tsx)");
  else {
    const twMissing = ["title", "description", "image"].filter((k) => !p.twitter[k] && !p.og[k]).map((k) => `twitter:${k}`);
    if (twMissing.length) add("warning", "twitter-tags", `Missing ${twMissing.join(", ")}`, "Twitter title, description, image", "twitter in metadata");
  }
  if (!p.icon) add("info", "site-icon", "Missing", "A favicon", "app/icon.png or app/favicon.ico");

  const h1s = p.headings.filter((h) => h.level === 1);
  if (!h1s.length) add("error", "h1", "Missing", "Exactly one h1", "the first section of the page (components/sections)");
  else if (h1s.length > 1) add("error", "h1-multiple", h1s.map((h) => `"${h.text}"`).join(", "), "Exactly one h1", "components/sections: only the first section renders h1");
  if (h1s.some((h) => !h.text)) add("error", "h1-empty", "Empty h1", "h1 with text", "components/sections");
  let previous = 0;
  for (const h of p.headings) {
    if (previous && h.level > previous + 1) add("warning", "heading-order", `h${previous} -> h${h.level} "${h.text}"`, "No skipped levels", "components/sections heading levels");
    previous = h.level;
  }

  p.images.forEach((img) => {
    const src = img.src ?? img["data-src"] ?? "(no src)";
    const name = decodeURIComponent(src.split("?url=").pop().split("&")[0]).split("/").pop();
    if (!("alt" in img)) add("error", "img-alt", name, "alt attribute", "next/image alt from content");
    else if (!img.alt.trim()) add("info", "img-alt-empty", name, "Empty alt only for decorative images", "content alt text");
    if (!img.width || !img.height) {
      if (!/position:\s*absolute/.test(img.style ?? "")) add("warning", "img-dimensions", name, "width and height (or fill with sizes)", "next/image props");
    }
  });
  const first = p.images[0];
  if (first?.loading === "lazy" && first.fetchpriority !== "high") {
    add("info", "first-image-lazy", (first.src ?? "").split("/").pop(), "priority on the above-the-fold hero image", "next/image priority in the first section");
  }

  const origin = new URL(finalUrl).origin;
  const internalLinks = new Set();
  p.links.forEach((link) => {
    const href = (link.href ?? "").trim();
    if (!href || href === "#" || /^javascript:/i.test(href)) {
      add("warning", "link-placeholder", `href="${href}" text "${link.text}"`, "A real URL, or a <button> for actions", "the component or content");
      return;
    }
    if (!link.text) add("warning", "link-text", href, "Visible text, aria-label, or image alt", "the component rendering the link");
    let abs;
    try {
      abs = new URL(href, finalUrl);
    } catch {
      add("warning", "link-invalid", href, "Valid URL", "the component or content");
      return;
    }
    if (abs.origin === origin && /^https?:$/.test(abs.protocol)) {
      abs.hash = "";
      if (!abs.pathname.startsWith("/_next/") && !abs.pathname.startsWith("/admin")) internalLinks.add(abs.href);
      if (/\bnofollow\b/i.test(link.rel)) add("info", "internal-nofollow", href, "Internal links followed", "the link rel");
    }
  });

  if (!p.jsonLd.length) add("info", "structured-data", "None", "JSON-LD (Organization, WebSite, BreadcrumbList) when wanted", "a JSON-LD script in app/layout.tsx or the route");
  p.jsonLd.forEach((block, i) => {
    try {
      const data = JSON.parse(block);
      const items = Array.isArray(data) ? data : data["@graph"] ?? [data];
      if (!(data["@context"] ?? items[0]?.["@context"])) add("warning", "structured-data-context", `JSON-LD block ${i + 1}`, '"@context": "https://schema.org"', "the JSON-LD builder");
      if (items.some((it) => !it["@type"])) add("warning", "structured-data-type", `JSON-LD block ${i + 1}`, "@type on every item", "the JSON-LD builder");
    } catch (error) {
      add("error", "structured-data-invalid", `JSON-LD block ${i + 1}: ${error.message}`, "Valid JSON", "the JSON-LD builder");
    }
  });

  return {
    url,
    finalUrl,
    status: res.status,
    data: {
      title,
      description: p.description,
      canonical: p.canonicals[0] ?? null,
      robots: p.robots,
      lang: p.lang,
      h1: h1s.map((h) => h.text),
      headings: p.headings.map((h) => `h${h.level} ${h.text}`.slice(0, 90)),
      images: p.images.length,
      links: p.links.length,
      jsonLdBlocks: p.jsonLd.length,
    },
    issues,
    internalLinks: [...internalLinks],
  };
}

function normalize(url) {
  const u = new URL(url);
  u.hash = "";
  if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
  return u.href;
}
