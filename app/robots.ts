import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export default function robots(): MetadataRoute.Robots {
  const baseUrl = getSiteUrl();

  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/admin/', '/portal-admin/', '/dashboard/', '/analytics/', '/alerts/', '/configuration/', '/reports/', '/profile/', '/auth/'],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
