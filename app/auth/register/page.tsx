'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import Cookies from 'js-cookie';
import { app } from '@/lib/firebase';
import { getErrorMessage } from '@/lib/error-utils';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Sun,
  Moon,
  Eye,
  EyeOff,
  Droplets,
  Lock,
  Mail,
  User,
  Check,
  ArrowRight,
} from 'lucide-react';

const registerSchema = z
  .object({
    displayName: z
      .string()
      .min(1, 'Full name is required')
      .min(2, 'Name must be at least 2 characters'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid work email address'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(12, 'Password must be at least 12 characters'),
    confirmPassword: z
      .string()
      .min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

interface PasswordCriteria {
  hasMinLength: boolean;
  hasUpper: boolean;
  hasLower: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  score: number;
  label: string;
  color: string;
}

function calculatePasswordStrength(pass: string): PasswordCriteria {
  if (!pass) {
    return {
      hasMinLength: false,
      hasUpper: false,
      hasLower: false,
      hasNumber: false,
      hasSpecial: false,
      score: 0,
      label: 'Enter password',
      color: 'bg-slate-300 dark:bg-slate-700',
    };
  }

  const hasMinLength = pass.length >= 12;
  const hasUpper = /[A-Z]/.test(pass);
  const hasLower = /[a-z]/.test(pass);
  const hasNumber = /[0-9]/.test(pass);
  const hasSpecial = /[^A-Za-z0-9]/.test(pass);

  let rawScore = 0;
  if (pass.length >= 8) rawScore += 1;
  if (hasMinLength) rawScore += 1;
  if (hasUpper && hasLower) rawScore += 1;
  if (hasNumber) rawScore += 1;
  if (hasSpecial) rawScore += 1;

  if (!hasMinLength) {
    return {
      hasMinLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      score: Math.min(rawScore, 2),
      label: 'Too short (Min 12 required)',
      color: 'bg-rose-500',
    };
  }

  if (rawScore <= 2) {
    return {
      hasMinLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      score: 2,
      label: 'Fair',
      color: 'bg-amber-500',
    };
  }

  if (rawScore <= 4) {
    return {
      hasMinLength,
      hasUpper,
      hasLower,
      hasNumber,
      hasSpecial,
      score: 3,
      label: 'Good',
      color: 'bg-sky-500',
    };
  }

  return {
    hasMinLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
    score: 4,
    label: 'Strong',
    color: 'bg-emerald-500',
  };
}

export default function RegisterPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
  });

  const passwordValue = watch('password') || '';
  const passwordStrength = useMemo(
    () => calculatePasswordStrength(passwordValue),
    [passwordValue],
  );

  const onSubmit = async (data: RegisterFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      // Step 1: Call API route — creates Firebase Auth user + Firestore document
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: data.email,
          password: data.password,
          displayName: data.displayName,
        }),
      });

      const result = await res.json();
      if (!res.ok || !result.success) {
        throw new Error(result.error || 'Registration failed');
      }

      // Step 2: Sign in with Firebase client so the auth cookie gets set
      const { signInWithEmailAndPassword, getAuth } =
        await import('firebase/auth');
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, data.email, data.password);
      Cookies.set('auth-token', '1', { expires: 7, path: '/', sameSite: 'lax' });

      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      console.warn('Register attempt failed:', err);
      const errorMessage = getErrorMessage(err);
      if (
        errorMessage?.includes('email-already-in-use') ||
        errorMessage?.includes('already exists')
      ) {
        setError('Email is already registered. Please sign in instead.');
      } else {
        setError(errorMessage || 'Failed to create account. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

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
        className="fixed top-4 right-4 z-50 btn btn-sm btn-ghost btn-circle bg-white/80 dark:bg-slate-900/80 backdrop-blur-md border border-slate-200 dark:border-slate-800 shadow-sm"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <Sun className="w-4 h-4 text-amber-400" />
        ) : (
          <Moon className="w-4 h-4 text-slate-700" />
        )}
      </button>

      {/* Glassmorphic Register Card */}
      <main className="relative z-10 w-full max-w-lg bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 transition-all">
        {/* Brand Header */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-red-500/15 text-[#B5121B] dark:text-red-400 mb-3 shadow-inner ring-1 ring-[#C9A227]/40">
            <Droplets className="w-6 h-6" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Create Klir Account
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Access real-time smart flush telemetry and unit controls
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

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {/* Full Name */}
          <div className="form-control">
            <label className="label py-1" htmlFor="register-name">
              <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                Full Name
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <User className="h-4 w-4" />
              </div>
              <input
                id="register-name"
                type="text"
                placeholder="Alex Morgan"
                className={`input input-bordered w-full pl-10 bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none transition-all ${
                  errors.displayName ? 'input-error border-rose-500' : ''
                }`}
                {...register('displayName')}
              />
            </div>
            {errors.displayName && (
              <label className="label py-1">
                <span className="label-text-alt text-rose-500 font-medium">
                  {errors.displayName.message}
                </span>
              </label>
            )}
          </div>

          {/* Email Address */}
          <div className="form-control">
            <label className="label py-1" htmlFor="register-email">
              <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                Work Email Address
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="register-email"
                type="email"
                placeholder="alex.morgan@organization.com"
                className={`input input-bordered w-full pl-10 bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none transition-all ${
                  errors.email ? 'input-error border-rose-500' : ''
                }`}
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

          {/* Password with Live Strength Indicator */}
          <div className="form-control">
            <div className="flex items-center justify-between py-1">
              <label className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="register-password">
                Password
              </label>
              <span className="text-[11px] text-slate-500 dark:text-slate-400">
                Minimum 12 characters
              </span>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="register-password"
                type={showPassword ? 'text' : 'password'}
                placeholder="••••••••••••"
                className={`input input-bordered w-full pl-10 pr-11 bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none transition-all ${
                  errors.password ? 'input-error border-rose-500' : ''
                }`}
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                onClick={() => setShowPassword(!showPassword)}
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

            {/* Live Password Strength Meter */}
            {passwordValue.length > 0 && (
              <div className="mt-2.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200/80 dark:border-slate-800/80 space-y-2 animate-fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-slate-400 font-medium">
                    Password Strength:
                  </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-200">
                    {passwordStrength.label}
                  </span>
                </div>

                {/* Strength Meter Bar */}
                <div className="grid grid-cols-4 gap-1.5 h-1.5 w-full">
                  {[1, 2, 3, 4].map((step) => (
                    <div
                      key={step}
                      className={`h-full rounded-full transition-all duration-300 ${
                        passwordStrength.score >= step
                           ? passwordStrength.color
                          : 'bg-slate-200 dark:bg-slate-800'
                      }`}
                    />
                  ))}
                </div>

                {/* Requirements Checklist */}
                <div className="grid grid-cols-2 gap-x-2 gap-y-1 pt-1 text-[11px]">
                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordStrength.hasMinLength
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    <Check
                      className={`w-3 h-3 ${
                        passwordStrength.hasMinLength ? 'opacity-100' : 'opacity-30'
                      }`}
                    />
                    <span>12+ characters</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordStrength.hasUpper && passwordStrength.hasLower
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    <Check
                      className={`w-3 h-3 ${
                        passwordStrength.hasUpper && passwordStrength.hasLower
                          ? 'opacity-100'
                          : 'opacity-30'
                      }`}
                    />
                    <span>Upper &amp; lowercase</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordStrength.hasNumber
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    <Check
                      className={`w-3 h-3 ${
                        passwordStrength.hasNumber ? 'opacity-100' : 'opacity-30'
                      }`}
                    />
                    <span>At least 1 number</span>
                  </div>

                  <div
                    className={`flex items-center gap-1.5 ${
                      passwordStrength.hasSpecial
                        ? 'text-emerald-600 dark:text-emerald-400 font-medium'
                        : 'text-slate-400'
                    }`}
                  >
                    <Check
                      className={`w-3 h-3 ${
                        passwordStrength.hasSpecial ? 'opacity-100' : 'opacity-30'
                      }`}
                    />
                    <span>Special character</span>
                  </div>
                </div>
              </div>
            )}

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
            <label className="label py-1" htmlFor="register-confirm-password">
              <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                Confirm Password
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="register-confirm-password"
                type={showConfirm ? 'text' : 'password'}
                placeholder="••••••••••••"
                className={`input input-bordered w-full pl-10 pr-11 bg-slate-50/70 dark:bg-slate-950/60 border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none transition-all ${
                  errors.confirmPassword ? 'input-error border-rose-500' : ''
                }`}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                onClick={() => setShowConfirm(!showConfirm)}
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

          {/* Register Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              className="btn btn-primary w-full h-12 min-h-[48px] bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm rounded-xl transition-all disabled:bg-[#B5121B] disabled:text-white disabled:opacity-90"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="loading loading-spinner loading-sm"></span>
                  <span>Creating Account...</span>
                </span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Create Klir Account
                  <ArrowRight className="w-4 h-4" />
                </span>
              )}
            </button>
          </div>
        </form>

        <div className="divider my-6 text-xs uppercase tracking-wider text-slate-600 dark:text-slate-400 font-medium">
          Or
        </div>

        <div className="text-center text-xs sm:text-sm text-slate-600 dark:text-slate-400">
          Already have an account?{' '}
          <Link
            href="/auth/login"
            className="font-semibold text-[#B5121B] hover:text-[#8F0D16] dark:text-red-400 hover:underline ml-1"
          >
            Login here
          </Link>
        </div>
      </main>
    </div>
  );
}
