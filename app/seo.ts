import type { Metadata } from 'next';

/**
 * Titles, descriptions and link previews. A pasted GameMog link should unfurl
 * as a card with a picture, a name and one plain sentence, in chats and posts
 * alike. Next resolves the relative addresses here against SITE_URL (set it
 * in production; Netlify's or Render's own URL is used when it is not).
 */
export const siteUrl = () => new URL(process.env.SITE_URL ?? process.env.URL ?? process.env.RENDER_EXTERNAL_URL ?? 'http://localhost:3939');

export const DEFAULT_DESCRIPTION =
  'Make a 3D game from one sentence, play it in your browser, and Mog any world into a better one. Speed skating, cycling, kart racing and more.';

type Image = { url: string; width?: number; height?: number; alt?: string };
const CARD: Image = { url: '/og.jpg', width: 1200, height: 630, alt: 'GameMog: one game, endless mogs' };

/** Keep a description to one unfurl's length, cut at a word. */
export function clip(text: string, max = 158) {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return t.slice(0, t.lastIndexOf(' ', max - 3)).replace(/[,.;:]$/, '') + '...';
}

export function pageMeta({ name, description, path, image, noindex }: {
  /** The page's own name; the tab reads "name | GameMog". */
  name?: string; description: string; path: string; image?: Image; noindex?: boolean;
}): Metadata {
  const title = name ? `${name} | GameMog` : 'GameMog';
  const img = image ?? CARD;
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: { type: 'website', siteName: 'GameMog', locale: 'en_US', title: name ?? 'GameMog', description, url: path, images: [img] },
    twitter: { card: 'summary_large_image', title: name ?? 'GameMog', description, images: [img.url] },
    ...(noindex ? { robots: { index: false, follow: false } } : {}),
  };
}
