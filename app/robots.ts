import type { MetadataRoute } from 'next';
import { siteUrl } from './seo';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/d/', '/me'] },
    sitemap: new URL('/sitemap.xml', siteUrl()).toString(),
  };
}
