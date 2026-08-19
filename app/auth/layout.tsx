import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Authentication | Klir',
  description:
    'Secure sign-in, registration, and credential management for the Klir Smart Flush Console.',
  openGraph: {
    title: 'Authentication | Klir Smart Flush Console',
    description:
      'Access real-time IoT sanitation controls, telemetry feeds, and facility automation rules.',
    url: '/auth/login',
    siteName: 'Klir',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/opengraph-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Klir IoT Smart Flush & Disinfection Platform',
        type: 'image/jpeg',
      },
      {
        url: '/og-image.jpg',
        width: 1200,
        height: 630,
        alt: 'Klir IoT Smart Flush & Disinfection Platform',
        type: 'image/jpeg',
      },
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'Klir IoT Smart Flush & Disinfection Platform',
        type: 'image/png',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Authentication | Klir Smart Flush Console',
    description:
      'Access real-time IoT sanitation controls, telemetry feeds, and facility automation rules.',
    images: ['/opengraph-image.jpg', '/og-image.jpg', '/og-image.png'],
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
