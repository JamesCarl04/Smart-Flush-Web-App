import type { Metadata } from 'next';
import { getSiteUrl } from '@/lib/site-url';

export const metadata: Metadata = {
  title: 'Authentication | Klir',
  description:
    'Secure sign-in, registration, and credential management for the Klir Smart Flush Console.',
  openGraph: {
    title: 'Authentication | Klir Smart Flush Console',
    description:
      'Access real-time IoT sanitation controls, telemetry feeds, and facility automation rules.',
    url: '/portal-admin/login',
    siteName: 'Klir',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-banner.jpg',
        width: 1200,
        height: 630,
        alt: 'Authentication | Klir Smart Flush Console',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Authentication | Klir Smart Flush Console',
    description:
      'Access real-time IoT sanitation controls, telemetry feeds, and facility automation rules.',
    images: ['/og-banner.jpg'],
    creator: '@KlirSmartFlush',
  },
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
