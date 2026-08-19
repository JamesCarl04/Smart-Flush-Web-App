import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Klir - IoT Smart Flush & Disinfection Platform',
    short_name: 'Klir',
    description:
      'Commercial IoT Smart Flush & UV-C Disinfection Management System with real-time telemetry, automated cycles, and predictive water analytics.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0B0F19',
    theme_color: '#B5121B',
    icons: [
      {
        src: '/favicon.ico',
        sizes: 'any',
        type: 'image/x-icon',
      },
      {
        src: '/og-image.png',
        sizes: '1200x630',
        type: 'image/png',
        purpose: 'maskable',
      },
    ],
  };
}
