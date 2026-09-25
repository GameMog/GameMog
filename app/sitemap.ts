import type { MetadataRoute } from 'next';
import { listGames } from '@/lib/db';
import { CHARTS } from '@/lib/catalog';
import { siteUrl } from './seo';

export const dynamic = 'force-dynamic';

/** Every public page, and every live game. Unpublished games drop out on their own. */
export default function sitemap(): MetadataRoute.Sitemap {
  const at = (path: string) => new URL(path, siteUrl()).toString();
  const pages = ['/', '/create', '/library', '/terms', '/privacy', ...Object.keys(CHARTS).map((s) => `/charts/${s}`)];
  return [
    ...pages.map((p) => ({ url: at(p), changeFrequency: 'daily' as const, priority: p === '/' ? 1 : 0.6 })),
    ...listGames(1000).map((g) => ({ url: at(`/g/${g.slug}`), lastModified: new Date(g.created_at), changeFrequency: 'weekly' as const, priority: 0.8 })),
  ];
}
