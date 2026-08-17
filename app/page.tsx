import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  const presentationMode = cookieStore.get('presentation-mode')?.value;

  if (token || presentationMode === '1') {
    redirect('/dashboard');
  }

  redirect('/auth/login');
}
