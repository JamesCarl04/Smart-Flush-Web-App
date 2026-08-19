import type { MetadataRoute } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = getSiteUrl();

  const routes = [
    '',
    '/dashboard',
    '/analytics',
    '/alerts',
    '/configuration',
    '/reports',
    '/profile',
    '/auth/login',
  ];

  return routes.map((route) => ({
    url: `${baseUrl}${route}`,
    lastModified: new Date(),
    changeFrequency:
      route === '' || route === '/dashboard' ? 'always' : 'daily',
    priority: route === '' ? 1 : route === '/dashboard' ? 0.9 : 0.8,
  }));
}
