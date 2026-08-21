import type { Metadata } from 'next';
import localFont from 'next/font/local';
import './globals.css';
import { AuthProvider } from '@/contexts/AuthContext';
import { ThemeProvider } from '@/contexts/ThemeContext';
import { getSiteUrl } from '@/lib/site-url';

const geistSans = localFont({
  src: './fonts/GeistVF.woff',
  variable: '--font-geist-sans',
  weight: '100 900',
});
const geistMono = localFont({
  src: './fonts/GeistMonoVF.woff',
  variable: '--font-geist-mono',
  weight: '100 900',
});

export const metadata: Metadata = {
  metadataBase: new URL(getSiteUrl()),
  title: {
    default: 'Klir | IoT Smart Flush & Disinfection Management',
    template: '%s | Klir',
  },
  description:
    'Next-generation IoT sanitation dashboard providing real-time flush monitoring, automated UV disinfection cycles, water conservation analytics, and proactive hardware telemetry.',
  keywords: [
    'IoT',
    'Smart Flush',
    'Sanitation Management',
    'UV Disinfection',
    'Water Conservation',
    'Ultrasonic Telemetry',
    'Facility Automation',
    'HiveMQ',
    'Restroom Analytics',
    'Klir',
  ],
  authors: [{ name: 'Klir Engineering Team' }],
  creator: 'Klir',
  publisher: 'Klir',
  openGraph: {
    title: 'Klir | IoT Smart Flush & Disinfection Management',
    description:
      'Next-generation IoT sanitation dashboard providing real-time flush monitoring, automated UV disinfection cycles, water conservation analytics, and proactive hardware telemetry.',
    url: '/',
    siteName: 'Klir',
    locale: 'en_US',
    type: 'website',
    images: [
      {
        url: '/og-banner.jpg',
        width: 1200,
        height: 630,
        alt: 'Klir — IoT Smart Flush & Disinfection Platform',
      },
    ],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Klir | IoT Smart Flush & Disinfection Management',
    description:
      'Next-generation IoT sanitation dashboard providing real-time flush monitoring, automated UV disinfection cycles, water conservation analytics, and proactive hardware telemetry.',
    images: ['/og-banner.jpg'],
    creator: '@KlirSmartFlush',
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  alternates: {
    canonical: '/',
  },
  icons: {
    icon: '/favicon.ico',
    apple: '/favicon.ico',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const siteUrl = getSiteUrl();
  const structuredData = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'Organization',
        '@id': `${siteUrl}/#organization`,
        name: 'Klir',
        url: siteUrl,
        logo: `${siteUrl}/og-banner.jpg`,
        description:
          'Next-generation IoT sanitation dashboard providing real-time flush monitoring, automated UV disinfection cycles, water conservation analytics, and proactive hardware telemetry.',
      },
      {
        '@type': 'WebSite',
        '@id': `${siteUrl}/#website`,
        url: siteUrl,
        name: 'Klir Smart Flush & Disinfection Platform',
        publisher: {
          '@id': `${siteUrl}/#organization`,
        },
        description:
          'Next-generation IoT sanitation dashboard providing real-time flush monitoring, automated UV disinfection cycles, water conservation analytics, and proactive hardware telemetry.',
      },
    ],
  };

  return (
    <html
      lang="en"
      suppressHydrationWarning
      className="bg-base-100 transition-colors duration-300"
    >
      <head>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(structuredData),
          }}
        />
        {/* Inline script runs synchronously before React hydrates, preventing flash-of-wrong-theme */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('theme') || 'light';
                  document.documentElement.setAttribute('data-theme', theme);
                } catch(error) {}
              })();
            `,
          }}
        />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} bg-base-100 text-base-content antialiased transition-colors duration-300`}
        suppressHydrationWarning
      >
        <ThemeProvider>
          <AuthProvider>{children}</AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
