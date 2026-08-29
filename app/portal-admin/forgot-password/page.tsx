'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { getErrorMessage } from '@/lib/error-utils';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Sun,
  Moon,
  Droplets,
  Mail,
  ArrowLeft,
  Send,
  CheckCircle2,
} from 'lucide-react';

const forgotPasswordSchema = z.object({
  email: z
    .string()
    .min(1, 'Email address is required')
    .email('Please enter a valid work email address'),
});

type ForgotPasswordFormValues = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { theme, toggleTheme } = useTheme();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordFormValues>({
    resolver: zodResolver(forgotPasswordSchema),
    mode: 'onTouched',
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const response = await fetch('/api/auth/password-reset/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: data.email }),
      });
      const result = (await response.json()) as {
        success?: boolean;
        error?: string;
      };

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to send reset email.');
      }

      setSuccess(
        'If an account exists for that email, a secure password reset link has been dispatched.',
      );
    } catch (err: unknown) {
      console.warn('Reset password error:', err);
      setError(getErrorMessage(err) ?? 'Failed to send reset email.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 bg-slate-100 dark:bg-slate-950 transition-colors">
      {/* Background Subtle Gradient Accents */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 w-96 h-96 bg-[#B5121B]/10 dark:bg-[#B5121B]/15 rounded-full blur-3xl"></div>
        <div className="absolute -bottom-40 -left-40 w-96 h-96 bg-[#C9A227]/10 dark:bg-[#C9A227]/15 rounded-full blur-3xl"></div>
      </div>

      {/* Theme toggle top-right */}
      <button
        onClick={toggleTheme}
        className="fixed top-4 right-4 z-50 btn btn-sm btn-ghost btn-circle bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <Sun className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 text-slate-700" />
        )}
      </button>

      {/* Glassmorphic Forgot Password Card */}
      <main className="relative z-10 w-full max-w-md bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 transition-all">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/15 text-[#B5121B] dark:text-red-400 mb-3 shadow-inner ring-1 ring-[#C9A227]/40">
            <Droplets className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Reset Password
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Enter your registered email to receive recovery instructions
          </p>
        </div>

        {error && (
          <div className="mb-6 rounded-xl border border-rose-500/30 bg-rose-500/10 p-3.5 text-xs sm:text-sm font-medium text-rose-600 dark:text-rose-400 flex items-start gap-2.5 animate-fade-in">
            <div className="h-4 w-4 shrink-0 rounded-full bg-rose-500/20 text-rose-600 dark:text-rose-400 flex items-center justify-center font-bold text-xs mt-0.5">
              !
            </div>
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="mb-6 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3.5 text-xs sm:text-sm font-medium text-emerald-700 dark:text-emerald-300 flex items-start gap-2.5 animate-fade-in">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Email Address */}
          <div className="form-control">
            <label className="label py-1" htmlFor="forgot-email">
              <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="forgot-email"
                type="email"
                placeholder="name@organization.com"
                className={`input input-bordered w-full pl-10 bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none transition-all ${
                  errors.email ? 'input-error border-rose-500' : ''
                }`}
                disabled={isLoading || success !== null}
                {...register('email')}
              />
            </div>
            {errors.email && (
              <label className="label py-1">
                <span className="label-text-alt text-rose-500 font-medium">
                  {errors.email.message}
                </span>
              </label>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              className="btn btn-primary w-full h-11 bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm rounded-xl transition-all"
              disabled={isLoading || success !== null}
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  <Send className="w-4 h-4" />
                  Send Reset Link
                </span>
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <Link
            href="/portal-admin/login"
            className="inline-flex items-center gap-1.5 font-semibold text-[#B5121B] hover:text-[#8F0D16] dark:text-red-400 hover:underline"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Sign In
          </Link>
        </div>
      </main>
    </div>
  );
}
