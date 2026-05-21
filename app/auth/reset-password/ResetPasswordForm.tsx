'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Eye, EyeOff, Moon, Sun } from 'lucide-react';
import * as z from 'zod';
import { useTheme } from '@/contexts/ThemeContext';
import { getErrorMessage } from '@/lib/error-utils';

const resetPasswordSchema = z
  .object({
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters'),
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

      setSuccess('Password reset successfully. Redirecting to login...');
      window.setTimeout(() => router.replace('/auth/login'), 1400);
    } catch (err: unknown) {
      console.error('Confirm reset password error:', err);
      setError(getErrorMessage(err) ?? 'Failed to reset password.');
    } finally {
      setIsLoading(false);
    }
  };

  const missingCode = !oobCode;

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center bg-base-200 p-4">
      <button
        onClick={toggleTheme}
        className="btn btn-ghost btn-circle fixed right-4 top-4 z-50"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <Sun className="h-5 w-5" />
        ) : (
          <Moon className="h-5 w-5" />
        )}
      </button>

      <div className="card w-full max-w-md bg-base-100 shadow-2xl">
        <form className="card-body" onSubmit={handleSubmit(onSubmit)}>
          <h2 className="card-title mb-2 justify-center text-2xl font-bold">
            Create New Password
          </h2>
          <p className="mb-4 text-center text-sm text-base-content/70">
            Enter a new password for your dashboard account.
          </p>

          {missingCode ? (
            <div className="alert alert-error mb-4 text-sm shadow-lg">
              <span>
                This password reset link is missing a reset code. Request a new
                link and try again.
              </span>
            </div>
          ) : null}

          {error ? (
            <div className="alert alert-error mb-4 text-sm shadow-lg">
              <span>{error}</span>
            </div>
          ) : null}

          {success ? (
            <div className="alert alert-success mb-4 text-sm shadow-lg">
              <span>{success}</span>
            </div>
          ) : null}

          <div className="form-control mb-2">
            <label className="label" htmlFor="new-password">
              <span className="label-text">New Password</span>
            </label>
            <div className="relative">
              <input
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="********"
                className={`input input-bordered w-full pr-10 ${
                  errors.password ? 'input-error' : ''
                }`}
                disabled={missingCode || !!success}
                {...register('password')}
              />
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setShowPassword((current) => !current)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="h-4 w-4 opacity-50" />
                ) : (
                  <Eye className="h-4 w-4 opacity-50" />
                )}
              </button>
            </div>
            {errors.password ? (
              <label className="label">
                <span className="label-text-alt text-error">
                  {errors.password.message}
                </span>
              </label>
            ) : null}
          </div>

          <div className="form-control mb-4">
            <label className="label" htmlFor="confirm-password">
              <span className="label-text">Confirm Password</span>
            </label>
            <div className="relative">
              <input
                id="confirm-password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="********"
                className={`input input-bordered w-full pr-10 ${
                  errors.confirmPassword ? 'input-error' : ''
                }`}
                disabled={missingCode || !!success}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                className="btn btn-ghost btn-xs btn-circle absolute right-3 top-1/2 -translate-y-1/2"
                onClick={() => setShowConfirm((current) => !current)}
                tabIndex={-1}
              >
                {showConfirm ? (
                  <EyeOff className="h-4 w-4 opacity-50" />
                ) : (
                  <Eye className="h-4 w-4 opacity-50" />
                )}
              </button>
            </div>
            {errors.confirmPassword ? (
              <label className="label">
                <span className="label-text-alt text-error">
                  {errors.confirmPassword.message}
                </span>
              </label>
            ) : null}
          </div>

          <div className="form-control mt-4">
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isLoading || missingCode || !!success}
            >
              {isLoading ? (
                <span className="loading loading-spinner"></span>
              ) : (
                'Reset Password'
              )}
            </button>
          </div>

          <div className="mt-6 text-center text-sm">
            <Link
              href="/auth/forgot-password"
              className="link link-primary font-semibold"
            >
              Request a new link
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
