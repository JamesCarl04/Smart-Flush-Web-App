import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Smart Flush | Login',
  description: 'Log in to your Smart Flush account.',
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
