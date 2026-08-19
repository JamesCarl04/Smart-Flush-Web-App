import fs from 'fs';
import path from 'path';
import { metadata } from '@/app/layout';
import robots from '@/app/robots';
import sitemap from '@/app/sitemap';
import manifest from '@/app/manifest';
import { generateOgImagePng } from '@/lib/generate-og-png';

describe('Open Graph, Twitter, and SEO Metadata Suite', () => {
  beforeAll(() => {
    // Ensure public directory and static fallback asset exist
    generateOgImagePng();
  });

  describe('app/layout.tsx Metadata Configuration', () => {
    it('should define metadataBase as a valid URL', () => {
      expect(metadata.metadataBase).toBeDefined();
      expect(metadata.metadataBase instanceof URL).toBe(true);
      expect(metadata.metadataBase?.protocol).toMatch(/^https?:$/);
    });

    it('should define OpenGraph metadata with title, type, and images', () => {
      expect(metadata.openGraph).toBeDefined();
      expect(metadata.openGraph?.title).toBeDefined();
      expect(metadata.openGraph?.type).toBe('website');
      expect(metadata.openGraph?.images).toBeDefined();

      const images = Array.isArray(metadata.openGraph?.images)
        ? metadata.openGraph?.images
        : [metadata.openGraph?.images];

      expect(images.length).toBeGreaterThan(0);
      const firstImage = images[0] as {
        url: string;
        width?: number;
        height?: number;
        alt?: string;
      };
      expect(firstImage.url).toBeDefined();
      expect(firstImage.width).toBe(1200);
      expect(firstImage.height).toBe(630);
    });

    it('should define Twitter metadata with large image card', () => {
      expect(metadata.twitter).toBeDefined();
      expect(metadata.twitter?.card).toBe('summary_large_image');
      expect(metadata.twitter?.title).toBeDefined();
      expect(metadata.twitter?.images).toBeDefined();
    });
  });

  describe('app/robots.ts Configuration', () => {
    it('should return valid robots configuration with allow, disallow, and sitemap URL', () => {
      const robotsResult = robots();
      expect(robotsResult).toBeDefined();
      expect(robotsResult.sitemap).toBeDefined();
      expect(typeof robotsResult.sitemap).toBe('string');
      expect(robotsResult.sitemap).toMatch(/sitemap\.xml$/);

      const rules = Array.isArray(robotsResult.rules)
        ? robotsResult.rules[0]
        : robotsResult.rules;

      expect(rules).toBeDefined();
      expect(rules?.allow).toBe('/');
      expect(rules?.disallow).toContain('/api/');
    });
  });

  describe('app/sitemap.ts Configuration', () => {
    it('should return valid sitemap routes including core navigation paths', () => {
      const sitemapResult = sitemap();
      expect(Array.isArray(sitemapResult)).toBe(true);
      expect(sitemapResult.length).toBeGreaterThan(0);

      const urls = sitemapResult.map((entry) => entry.url);
      expect(urls.some((url) => url.endsWith('/dashboard'))).toBe(true);
      expect(urls.some((url) => url.endsWith('/analytics'))).toBe(true);
      expect(urls.some((url) => url.endsWith('/alerts'))).toBe(true);
      expect(urls.some((url) => url.endsWith('/configuration'))).toBe(true);
      expect(urls.some((url) => url.endsWith('/reports'))).toBe(true);

      sitemapResult.forEach((entry) => {
        expect(entry.url).toMatch(/^https?:\/\//);
        expect(entry.lastModified).toBeDefined();
      });
    });
  });

  describe('app/manifest.ts Configuration', () => {
    it('should return web app manifest with brand name and theme color', () => {
      const manifestResult = manifest();
      expect(manifestResult).toBeDefined();
      expect(manifestResult.name).toContain('Klir');
      expect(manifestResult.short_name).toBe('Klir');
      expect(manifestResult.theme_color).toBe('#B5121B');
      expect(manifestResult.background_color).toBe('#0B0F19');
      expect(manifestResult.display).toBe('standalone');
      expect(Array.isArray(manifestResult.icons)).toBe(true);
      expect(manifestResult.icons?.length).toBeGreaterThan(0);
    });
  });

  describe('app/auth/layout.tsx Metadata Configuration', () => {
    it('should define OpenGraph and Twitter images on auth layout', async () => {
      const { metadata: authMetadata } = await import('@/app/auth/layout');
      expect(authMetadata).toBeDefined();
      expect(authMetadata.openGraph).toBeDefined();
      expect(authMetadata.openGraph?.images).toBeDefined();

      const images = Array.isArray(authMetadata.openGraph?.images)
        ? authMetadata.openGraph?.images
        : [authMetadata.openGraph?.images];

      expect(images.length).toBeGreaterThan(0);
      expect(authMetadata.twitter).toBeDefined();
      expect(authMetadata.twitter?.card).toBe('summary_large_image');
      expect(authMetadata.twitter?.images).toBeDefined();
    });
  });

  describe('Static OpenGraph & Twitter Image Assets', () => {
    it('should verify app/opengraph-image.png and app/twitter-image.png exist', () => {
      const ogPath = path.join(process.cwd(), 'app', 'opengraph-image.png');
      const twitterPath = path.join(process.cwd(), 'app', 'twitter-image.png');
      expect(fs.existsSync(ogPath)).toBe(true);
      expect(fs.existsSync(twitterPath)).toBe(true);
      expect(fs.statSync(ogPath).size).toBeGreaterThan(1000);
      expect(fs.statSync(twitterPath).size).toBeGreaterThan(1000);
    });

    it('should verify auth route static image assets exist', () => {
      const authOgPath = path.join(process.cwd(), 'app', 'auth', 'opengraph-image.png');
      const authTwitterPath = path.join(process.cwd(), 'app', 'auth', 'twitter-image.png');
      expect(fs.existsSync(authOgPath)).toBe(true);
      expect(fs.existsSync(authTwitterPath)).toBe(true);
    });
  });

  describe('Static Fallback Asset (public/og-image.png)', () => {
    it('should verify public/og-image.png exists with valid PNG signature', () => {
      const filePath = path.join(process.cwd(), 'public', 'og-image.png');
      expect(fs.existsSync(filePath)).toBe(true);

      const buffer = fs.readFileSync(filePath);
      expect(buffer.length).toBeGreaterThan(100);

      // Verify PNG Signature
      expect(buffer[0]).toBe(0x89);
      expect(buffer[1]).toBe(0x50); // P
      expect(buffer[2]).toBe(0x4e); // N
      expect(buffer[3]).toBe(0x47); // G
      expect(buffer[4]).toBe(0x0d);
      expect(buffer[5]).toBe(0x0a);
      expect(buffer[6]).toBe(0x1a);
      expect(buffer[7]).toBe(0x0a);
    });
  });
});
