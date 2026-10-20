# Site foundation templates

Starting points for `/next-app`. Replace every `<placeholder>` with project
values. Paths are relative to the source directory (`src/` when used). Adapt to
the installed Next.js version: route `params` are a Promise in Next.js 15 and
later.

## app/layout.tsx

```tsx
import type { Metadata } from "next";
import { Archivo, IBM_Plex_Sans } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { siteMetadata } from "@/lib/metadata";
import "./globals.css";

// Variables must match "variable" in blueprint/design/tokens.json.
const archivo = Archivo({ subsets: ["latin"], weight: ["600", "700"], variable: "--font-archivo", display: "swap" });
const plex = IBM_Plex_Sans({ subsets: ["latin"], weight: ["400", "500"], variable: "--font-plex", display: "swap" });

export const metadata: Metadata = siteMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="<lang>" className={`${archivo.variable} ${plex.variable}`}>
      <body className="font-body text-body bg-background text-foreground antialiased">
        <Header />
        <main id="main">{children}</main>
        <Footer />
      </body>
    </html>
  );
}
```

Licensed fonts use `next/font/local` with files in `app/fonts/` and the same
`variable`.

## lib/metadata.ts

```ts
import type { Metadata } from "next";

export const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
export const siteName = "<Site name>";

export const siteMetadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: { default: "<Default title, 30-60 chars>", template: `%s | ${siteName}` },
  description: "<Default description, 70-160 chars>",
  openGraph: { type: "website", siteName, images: ["/og.png"] },
  twitter: { card: "summary_large_image" },
};

export function pageMetadata(meta: { title: string; description?: string; path: string; image?: string }): Metadata {
  return {
    title: meta.title,
    description: meta.description,
    alternates: { canonical: meta.path },
    openGraph: { title: meta.title, description: meta.description, url: meta.path, ...(meta.image ? { images: [meta.image] } : {}) },
    twitter: { title: meta.title, description: meta.description },
  };
}
```

## components/sections/registry.ts (content source none)

```ts
import type { ComponentType } from "react";
// import { Hero } from "./Hero/Hero";
// import type { HeroProps } from "./Hero/Hero.types";

// One entry per section type key, added by /section.
type SectionMap = {
  // hero: HeroProps;
};

export type SectionType = keyof SectionMap;
export type SectionData = { [K in SectionType]: { type: K; id?: string } & SectionMap[K] }[SectionType];

export const registry: { [K in SectionType]: ComponentType<SectionMap[K]> } = {
  // hero: Hero,
};
```

## components/PageRenderer.tsx (content source none)

```tsx
import type { ComponentType } from "react";
import { registry, type SectionData } from "@/components/sections/registry";

export function PageRenderer({ sections }: { sections: SectionData[] }) {
  return sections.map((section, index) => {
    const { type, id, ...props } = section;
    const Component = registry[type] as ComponentType<typeof props>;
    return <Component key={id ?? `${type}-${index}`} {...props} />;
  });
}
```

## content/types.ts and content/pages/home.ts (content source none)

```ts
// content/types.ts
import type { SectionData } from "@/components/sections/registry";

export type Image = { src: string; alt: string; width: number; height: number };
export type Link = { label: string; href: string };

export type PageContent = {
  slug: string[];
  meta: { title: string; description: string; image?: string };
  sections: SectionData[];
};
```

```ts
// content/pages/home.ts
import type { PageContent } from "@/content/types";

export const home: PageContent = {
  slug: [],
  meta: { title: "<Home title>", description: "<Home description>" },
  sections: [],
};
```

## lib/content.ts (content source none)

```ts
import "server-only";
import { home } from "@/content/pages/home";
import type { PageContent } from "@/content/types";

const pages: PageContent[] = [home];

export function getPages() {
  return pages;
}

export function getPage(slug: string[] = []) {
  return pages.find((p) => p.slug.join("/") === slug.join("/")) ?? null;
}
```

## app/[[...slug]]/page.tsx

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PageRenderer } from "@/components/PageRenderer";
import { getPage, getPages } from "@/lib/content";
import { pageMetadata } from "@/lib/metadata";

type Props = { params: Promise<{ slug?: string[] }> };

export function generateStaticParams() {
  return getPages().map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const page = getPage(slug);
  if (!page) return {};
  return pageMetadata({ ...page.meta, path: `/${page.slug.join("/")}` });
}

export default async function Page({ params }: Props) {
  const { slug } = await params;
  const page = getPage(slug);
  if (!page) notFound();
  return <PageRenderer sections={page.sections} />;
}
```

## app/sitemap.ts and app/robots.ts

```ts
// app/sitemap.ts
import type { MetadataRoute } from "next";
import { getPages } from "@/lib/content";
import { siteUrl } from "@/lib/metadata";

export default function sitemap(): MetadataRoute.Sitemap {
  return getPages().map((p) => ({ url: new URL(`/${p.slug.join("/")}`, siteUrl).href }));
}
```

```ts
// app/robots.ts
import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/metadata";

export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" }, sitemap: new URL("/sitemap.xml", siteUrl).href };
}
```

With Payload, add `disallow: "/admin"`.

## components/layout/Header.tsx

```tsx
import Link from "next/link";
import { site } from "@/content/site";
import { MobileMenu } from "./MobileMenu";

export function Header() {
  return (
    <header data-section="header" className="bg-background">
      <div className="mx-auto flex max-w-site items-center justify-between px-gutter py-4">
        <Link href="/" data-el="logo" aria-label={`${site.name} home`}>
          {/* <Logo /> from components/icons after /assets */}
        </Link>
        <nav aria-label="Main" data-el="nav" className="hidden lg:block">
          <ul className="flex gap-8">
            {site.nav.map((item) => (
              <li key={item.href}>
                <Link href={item.href} className="text-body text-foreground hover:text-brand focus-visible:ring-2 focus-visible:ring-ring">
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <MobileMenu items={site.nav} />
      </div>
    </header>
  );
}
```

`py-4` is allowed only when it equals the Figma value exactly; otherwise add a
spacing token. `MobileMenu.tsx` is the `"use client"` leaf: a shadcn `Sheet`
with a `SheetTrigger` button (`data-el="menu-button"`, `className="lg:hidden"`,
an `aria-label`), restyled with tokens.

## Payload variants

- Layouts: `app/(frontend)/layout.tsx` holds the layout above; the installer
  owns `app/(payload)/`.
- `collections/Pages.ts`: `slug: "pages"`, `access: { read: () => true }`,
  fields `title`, `slug` (unique, index), `meta` group, and
  `{ name: "layout", type: "blocks", blocks: [] }`. `/section` adds each block.
- `globals/SiteSettings.ts`: logo, nav (array of label and link), footer
  columns, socials, with `access: { read: () => true }`.
- `lib/content.ts` reads with the Local API:

```ts
import "server-only";
import { getPayload } from "payload";
import config from "@payload-config";

export async function getPage(slug: string[] = []) {
  const payload = await getPayload({ config });
  const { docs } = await payload.find({
    collection: "pages",
    where: { slug: { equals: slug.join("/") || "home" } },
    limit: 1,
    depth: 1,
  });
  return docs[0] ?? null;
}
```

- Registry keys are block slugs and props come from `payload-types.ts`; the
  renderer switches on `blockType` instead of `type`.
