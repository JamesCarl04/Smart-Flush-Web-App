import type { MetadataRoute } from 'next';

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl =
    process.env.NEXT_PUBLIC_APP_URL || 'https://smart-flush.railway.app';

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
