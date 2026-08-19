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
    type: 'website',
  },
};

export default function AuthLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return <>{children}</>;
}
