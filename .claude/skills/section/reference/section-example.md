# Section example: Hero

Type key `hero`, folder `components/sections/Hero/`. Class names use tokens from
the `tokens.json` example in the figma skill (`text-h1`, `p-section`,
`max-w-site`, `rounded-card`, `bg-paper`).

## Hero.types.ts (content source none)

```ts
import type { Image, Link } from "@/content/types";

export type HeroProps = {
  eyebrow?: string;
  title: string;
  text?: string;
  image?: Image;
  cta?: Link;
  tone?: "light" | "dark";
};
```

## Hero.tsx

```tsx
import NextImage from "next/image";
import Link from "next/link";
import { cva } from "class-variance-authority";
import { cn } from "@/lib/utils";
import type { HeroProps } from "./Hero.types";

const root = cva("py-section", {
  variants: { tone: { light: "bg-paper text-ink", dark: "bg-ink text-white" } },
  defaultVariants: { tone: "light" },
});

export function Hero({ eyebrow, title, text, image, cta, tone }: HeroProps) {
  if (!title) return null;
  return (
    <section data-section="hero" aria-labelledby="hero-title" className={root({ tone })}>
      <div className="mx-auto grid max-w-site items-center gap-8 px-gutter lg:grid-cols-2">
        <div>
          {eyebrow ? (
            <p data-el="eyebrow" className="text-eyebrow font-heading text-brand uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h1 id="hero-title" data-el="title" className="text-h1 font-heading mt-4">
            {title}
          </h1>
          {text ? (
            <p data-el="text" className="text-body mt-6">
              {text}
            </p>
          ) : null}
          {cta ? (
            <Link
              href={cta.href}
              data-el="cta-primary"
              className={cn(
                "bg-primary text-primary-foreground text-button rounded-button mt-8 inline-flex px-button py-button",
                "focus-visible:ring-ring focus-visible:ring-2 focus-visible:ring-offset-2"
              )}
            >
              {cta.label}
            </Link>
          ) : null}
        </div>
        {image ? (
          <NextImage
            data-el="image"
            src={image.src}
            alt={image.alt}
            width={image.width}
            height={image.height}
            priority
            sizes="(width >= 1024px) 50vw, 100vw"
            className="rounded-card h-auto w-full object-cover"
          />
        ) : null}
      </div>
    </section>
  );
}
```

Notes:

- `gap-8`, `mt-4`, `mt-6`, `mt-8` are Tailwind multiples allowed only because
  they equal the Figma values exactly (32px, 16px, 24px, 32px). Anything else
  gets a spacing token (`px-button`, `py-button`).
- The section renders `h1` because Hero is the first section of the home page
  and carries the page title in Figma. On other pages the same component would
  take a `headingLevel` prop.
- `cva` lives in `class-variance-authority`, installed by shadcn.

## Registry entry

```ts
import { Hero } from "./Hero/Hero";
import type { HeroProps } from "./Hero/Hero.types";

type SectionMap = {
  hero: HeroProps;
};

export const registry: { [K in SectionType]: ComponentType<SectionMap[K]> } = {
  hero: Hero,
};
```

## Content entry (content/pages/home.ts)

```ts
sections: [
  {
    type: "hero",
    eyebrow: "<Figma copy>",
    title: "<Figma copy>",
    text: "<Figma copy>",
    image: { src: "/images/hero/hero-team-meeting.jpg", alt: "<what the photo shows>", width: 1200, height: 900 },
    cta: { label: "<Figma copy>", href: "/contact" },
  },
],
```

## Hero.block.ts (content source payload)

```ts
import type { Block } from "payload";

export const HeroBlock: Block = {
  slug: "hero",
  interfaceName: "HeroBlock",
  fields: [
    { name: "eyebrow", type: "text" },
    { name: "title", type: "text", required: true },
    { name: "text", type: "textarea" },
    { name: "image", type: "upload", relationTo: "media" },
    { name: "cta", type: "group", fields: [{ name: "label", type: "text" }, { name: "href", type: "text" }] },
    { name: "tone", type: "select", options: ["light", "dark"], defaultValue: "light" },
  ],
};
```

Props then come from `HeroBlock` in `payload-types.ts`; resolve the upload to
`{ src, alt, width, height }` in `lib/content.ts`, not in the component.

## A client leaf

When the section has a slider or tabs, only that part is a client component:

```tsx
// components/sections/Testimonials/TestimonialsCarousel.tsx
"use client";

import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious } from "@/components/ui/carousel";
```

The section stays a Server Component and passes plain serializable props.

## map.json entry

```json
"hero": {
  "component": "components/sections/Hero/Hero.tsx",
  "pages": ["home"],
  "nodes": { "375": "12:345", "1440": "12:300" },
  "elements": {
    "title": { "375": "12:350", "1440": "12:310" },
    "text": { "375": "12:351", "1440": "12:311" },
    "cta-primary": { "375": "12:360", "1440": "12:320" },
    "image": { "375": "12:370", "1440": "12:325" }
  }
}
```
