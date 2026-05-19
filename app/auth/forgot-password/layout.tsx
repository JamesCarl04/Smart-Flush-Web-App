import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Smart Flush | Forgot Password',
  description: 'Reset your Smart Flush account password.',
};

export default function ForgotPasswordLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
