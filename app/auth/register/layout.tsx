import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Smart Flush | Register',
  description: 'Create a new Smart Flush account.',
};

export default function RegisterLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
