'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { app } from '@/lib/firebase';
import { getErrorMessage } from '@/lib/error-utils';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon, Eye, EyeOff } from 'lucide-react';

const registerSchema = z
  .object({
    displayName: z
      .string()
      .min(1, 'Name is required')
      .min(2, 'Name must be at least 2 characters'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(1, 'Password is required')
      .min(8, 'Password must be at least 8 characters'),
    confirmPassword: z
      .string()
      .min(1, 'Please confirm your password'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

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
    formState: { errors },
  } = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    mode: 'onTouched',
  });

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

      router.push('/dashboard');
      router.refresh();
    } catch (err: unknown) {
      console.error('Register error:', err);
      const errorMessage = getErrorMessage(err);
      if (
        errorMessage?.includes('email-already-in-use') ||
        errorMessage?.includes('already exists')
      ) {
        setError('Email is already registered. Please login instead.');
      } else {
        setError(errorMessage || 'Failed to create account. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-4 bg-base-200">
      <button
        onClick={toggleTheme}
        className="btn btn-ghost btn-circle fixed top-4 right-4 z-50"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? (
          <Sun className="w-5 h-5" />
        ) : (
          <Moon className="w-5 h-5" />
        )}
      </button>
      <div className="card w-full max-w-md shadow-2xl bg-base-100">
        <form className="card-body" onSubmit={handleSubmit(onSubmit)}>
          <h2 className="card-title text-2xl font-bold mb-4 justify-center">
            Create an Account
          </h2>

          {error && (
            <div className="alert alert-error shadow-lg mb-4 text-sm">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                className="stroke-current shrink-0 h-6 w-6"
                fill="none"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth="2"
                  d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
              <span>{error}</span>
            </div>
          )}

          <div className="form-control mb-2">
            <label className="label">
              <span className="label-text">Name</span>
            </label>
            <input
              type="text"
              placeholder="John Doe"
              className={`input input-bordered ${errors.displayName ? 'input-error' : ''}`}
              {...register('displayName')}
            />
            {errors.displayName && (
              <label className="label">
                <span className="label-text-alt text-error">
                  {errors.displayName.message}
                </span>
              </label>
            )}
          </div>

          <div className="form-control mb-2">
            <label className="label">
              <span className="label-text">Email</span>
            </label>
            <input
              type="email"
              placeholder="email@example.com"
              className={`input input-bordered ${errors.email ? 'input-error' : ''}`}
              {...register('email')}
            />
            {errors.email && (
              <label className="label">
                <span className="label-text-alt text-error">
                  {errors.email.message}
                </span>
              </label>
            )}
          </div>

          <div className="form-control mb-2">
            <label className="label">
              <span className="label-text">Password</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                placeholder="********"
                className={`input input-bordered w-full pr-10 ${errors.password ? 'input-error' : ''}`}
                {...register('password')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? (
                  <EyeOff className="w-4 h-4 opacity-50" />
                ) : (
                  <Eye className="w-4 h-4 opacity-50" />
                )}
              </button>
            </div>
            {errors.password && (
              <label className="label">
                <span className="label-text-alt text-error">
                  {errors.password.message}
                </span>
              </label>
            )}
          </div>

          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Confirm Password</span>
            </label>
            <div className="relative">
              <input
                type={showConfirm ? 'text' : 'password'}
                placeholder="********"
                className={`input input-bordered w-full pr-10 ${errors.confirmPassword ? 'input-error' : ''}`}
                {...register('confirmPassword')}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex={-1}
              >
                {showConfirm ? (
                  <EyeOff className="w-4 h-4 opacity-50" />
                ) : (
                  <Eye className="w-4 h-4 opacity-50" />
                )}
              </button>
            </div>
            {errors.confirmPassword && (
              <label className="label">
                <span className="label-text-alt text-error">
                  {errors.confirmPassword.message}
                </span>
              </label>
            )}
          </div>

          <div className="form-control mt-4">
            <button
              type="submit"
              className="btn btn-primary w-full"
              disabled={isLoading}
            >
              {isLoading ? (
                <span className="loading loading-spinner"></span>
              ) : (
                'Register'
              )}
            </button>
          </div>

          <div className="divider text-sm text-base-content/60">Or</div>

          <div className="text-center text-sm">
            Already have an account?{' '}
            <Link
              href="/auth/login"
              className="link link-primary font-semibold"
            >
              Login here
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
