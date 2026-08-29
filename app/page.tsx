import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export default async function RootPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get('auth-token')?.value;
  const presentationMode = cookieStore.get('presentation-mode')?.value;

  if (token || presentationMode === '1') {
    redirect('/dashboard');
  }

  return (
    <main className="min-h-[100dvh] bg-slate-50 p-4 sm:p-6 text-slate-900 dark:bg-[#0b0f19] dark:text-slate-100 flex items-center justify-center">
      <section className="mx-auto w-full max-w-md rounded-2xl bg-white p-6 sm:p-8 shadow-sm ring-1 ring-slate-200/80 dark:bg-slate-900 dark:ring-slate-800 text-center">
        <div className="flex justify-center">
          <span className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            Klir<span className="text-[#B5121B]">.</span>
          </span>
        </div>
        <h1 className="mt-4 text-base font-bold text-slate-900 dark:text-white">
          Restroom Intelligence System
        </h1>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
          Smart campus sanitation monitoring and automated maintenance dispatch.
        </p>
        <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/50">
          <p className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            Reporting a Restroom Issue?
          </p>
          <p className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
            Please scan the QR code sticker located directly on or near the restroom stall to submit an instant report.
          </p>
        </div>
      </section>
    </main>
  );
}
