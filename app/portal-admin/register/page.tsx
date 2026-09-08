'use client';

import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon, ShieldAlert, Lock, ArrowLeft } from 'lucide-react';

export default function RegisterPage() {
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 transition-colors py-12">
      {/* Background Subtle Gradient Accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-[#B5121B]/10 dark:bg-[#B5121B]/15 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-[#C9A227]/10 dark:bg-[#C9A227]/15 rounded-full blur-3xl"></div>
      </div>

      {/* Theme toggle top-right */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 btn btn-sm btn-ghost btn-circle bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm focus-visible:ring-2 focus-visible:ring-[#B5121B]"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <Sun className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 text-slate-700" />
        )}
      </button>

      {/* Institutional Security Notice Card */}
      <main className="relative z-10 w-full max-w-lg bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 transition-all text-center">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-red-50 text-[#B5121B] dark:bg-red-950/50 dark:text-red-400 border border-red-200 dark:border-red-900/50">
          <ShieldAlert className="h-7 w-7" aria-hidden="true" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 mb-2">
          Registration Restricted
        </h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 mb-6 font-medium">
          Public self-registration has been decommissioned. Staff accounts are provisioned exclusively by authorized Facility Administrators.
        </p>

        <div className="text-left rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-4 mb-8 space-y-3">
          <div className="flex items-start gap-3">
            <Lock className="h-5 w-5 text-slate-500 dark:text-slate-400 shrink-0 mt-0.5" aria-hidden="true" />
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              If you are a technician, supervisor, or staff member requiring access to the Klir Management Console, please coordinate with your Facility Administrator to have your account provisioned.
            </p>
          </div>
        </div>

        <div>
          <Link
            href="/portal-admin/login"
            className="btn btn-primary w-full h-12 min-h-[48px] bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm rounded-xl inline-flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" />
            <span>Return to Login</span>
          </Link>
        </div>
      </main>
    </div>
  );
}
