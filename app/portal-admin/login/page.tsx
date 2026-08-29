'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { signInWithEmailAndPassword, getAuth } from 'firebase/auth';
import Cookies from 'js-cookie';
import { app } from '@/lib/firebase';
import { getErrorCode } from '@/lib/error-utils';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon, Eye, EyeOff, Lock, Mail, ArrowRight } from 'lucide-react';

const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const [showPassword, setShowPassword] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    mode: 'onTouched',
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, data.email, data.password);
      Cookies.set('auth-token', '1', { expires: 7, path: '/', sameSite: 'lax' });
      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      const errorCode = getErrorCode(err);
      console.warn('Login attempt failed with code:', errorCode);
      if (
        errorCode === 'auth/user-not-found' ||
        errorCode === 'auth/invalid-credential'
      ) {
        setError('Invalid email or password. Please check your credentials or register a new account.');
      } else if (errorCode === 'auth/wrong-password') {
        setError('Wrong password. Please verify your credentials.');
      } else if (errorCode === 'auth/too-many-requests') {
        setError('Too many login attempts. Please try again later.');
      } else if (errorCode === 'auth/network-request-failed') {
        setError('Network error. Please check your internet connection.');
      } else {
        setError('Failed to login. Please check your credentials.');
      }
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

      {/* Glassmorphic Login Card */}
      <main className="relative z-10 w-full max-w-md bg-white/85 dark:bg-slate-900/85 backdrop-blur-xl border border-slate-200/80 dark:border-slate-800 rounded-3xl shadow-2xl p-8 sm:p-10 transition-all">
        {/* Brand Header */}
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Welcome to Klir
          </h1>
          <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
            Smart Flush &amp; Disinfection Management Console
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
          {/* Email Field */}
          <div className="form-control">
            <label className="label py-1" htmlFor="login-email">
              <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                Email Address
              </span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Mail className="h-4 w-4" />
              </div>
              <input
                id="login-email"
                type="email"
                placeholder="name@organization.com"
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

          {/* Password Field */}
          <div className="form-control">
            <div className="flex items-center justify-between py-1">
              <label className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300" htmlFor="login-password">
                Password
              </label>
              <Link
                href="/portal-admin/forgot-password"
                className="text-xs font-medium text-[#B5121B] hover:text-[#8F0D16] dark:text-red-400 hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                <Lock className="h-4 w-4" />
              </div>
              <input
                id="login-password"
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
            {errors.password && (
              <label className="label py-1">
                <span className="label-text-alt text-rose-500 font-medium">
                  {errors.password.message}
                </span>
              </label>
            )}
          </div>

          {/* Submit Button */}
          <div className="pt-3">
            <button
              type="submit"
              className="btn btn-primary w-full h-12 min-h-[48px] bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm rounded-xl transition-all disabled:bg-[#B5121B] disabled:text-white disabled:opacity-90"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="loading loading-spinner loading-sm"></span>
              ) : (
                <span className="flex items-center justify-center gap-2">
                  Login to Dashboard
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
          Don&apos;t have an account?{' '}
          <Link
            href="/portal-admin/register"
            className="font-semibold text-[#B5121B] hover:text-[#8F0D16] dark:text-red-400 hover:underline ml-1"
          >
            Register here
          </Link>
        </div>
      </main>
    </div>
  );
}
