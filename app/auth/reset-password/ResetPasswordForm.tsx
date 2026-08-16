'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  Eye,
  EyeOff,
  Moon,
  Sun,
  Droplets,
  Lock,
  KeyRound,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
} from 'lucide-react';
import * as z from 'zod';
import { useTheme } from '@/contexts/ThemeContext';
import { getErrorMessage } from '@/lib/error-utils';

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Password is required')
      .min(12, 'Password must be at least 12 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type ResetPasswordFormValues = z.infer<typeof resetPasswordSchema>;

interface ResetPasswordResponse {
  success?: boolean;
  error?: string;
}

export function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const oobCode = useMemo(() => searchParams.get('oobCode') ?? '', [
    searchParams,
  ]);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordFormValues>({
    resolver: zodResolver(resetPasswordSchema),
    mode: 'onTouched',
  });

  const onSubmit = async (data: ResetPasswordFormValues) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch('/api/auth/password-reset/confirm', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          oobCode,
          newPassword: data.password,
        }),
      });
      const result = (await response.json()) as ResetPasswordResponse;

      if (!response.ok || !result.success) {
        throw new Error(result.error || 'Failed to reset password.');
      }

      setSuccess('Password updated successfully. Redirecting to login...');
      window.setTimeout(() => router.replace('/auth/login'), 1400);
    } catch (err: unknown) {
      console.warn('Confirm reset password error:', err);
      setError(getErrorMessage(err) ?? 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  const missingCode = !oobCode;

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

      {/* Glassmorphic Reset Card */}
      <main className="relative z-10 w-full max-w-md bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 transition-all">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/15 text-[#B5121B] dark:text-red-400 mb-3 shadow-inner ring-1 ring-[#C9A227]/40">
            <Droplets className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Set New Password
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Choose a strong password with at least 12 characters
          </p>
        </div>

        {missingCode && (
          <div className="mb-6 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3.5 text-xs sm:text-sm font-medium text-amber-700 dark:text-amber-300 flex items-start gap-2.5">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
            <span>
              This password reset link is missing a security token. Please request a new link.
            </span>
          </div>
        )}

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
          {/* New Password */}
          <div className="form-control">
            <div className="flex items-center justify-between py-1">
              <label className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="new-password">
                New Password
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Min 12 characters
              </span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                className={`input input-bordered w-full pl-10 pr-11 bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none transition-all ${
                  errors.password ? 'input-error border-rose-500' : ''
                }`}
                disabled={missingCode || !!success}
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                onClick={() => setShowPassword((current) => !current)}
                tabIndex={-1}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.password && (
              <label className="label py-1">
                <span className="label-text-alt text-rose-500 font-medium">
                  {errors.password.message}
                </span>
              </label>
            )}
          </div>

          {/* Confirm Password */}
          <div className="form-control">
            <label className="label py-1" htmlFor="confirm-password">
              <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                Confirm New Password
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <KeyRound className="h-4 w-4" />
              </div>
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••••••"
                className={`input input-bordered w-full pl-10 pr-11 bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none transition-all ${
                  errors.confirmPassword ? 'input-error border-rose-500' : ''
                }`}
                disabled={missingCode || !!success}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                onClick={() => setShowConfirm((current) => !current)}
                tabIndex={-1}
                aria-label={showConfirm ? 'Hide password' : 'Show password'}
              >
                {showConfirm ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <label className="label py-1">
                <span className="label-text-alt text-rose-500 font-medium">
                  {errors.confirmPassword.message}
                </span>
              </label>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              className="btn btn-primary w-full h-11 bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm rounded-xl transition-all"
              disabled={isLoading || missingCode || !!success}
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Save New Password
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </button>
          </div>
        </form>

        <div className="mt-6 text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          <Link
            href="/auth/forgot-password"
            className="font-semibold text-[#B5121B] hover:text-[#8F0D16] dark:text-red-400 hover:underline"
          >
            Request a new reset link
          </Link>
        </div>
      </main>
    </div>
  );
}
