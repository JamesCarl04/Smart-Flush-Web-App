"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { getAuth, sendPasswordResetEmail } from "firebase/auth";
import { app } from "@/lib/firebase";
import { getErrorCode } from "@/lib/error-utils";
import Link from "next/link";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon } from "lucide-react";

const forgotPasswordSchema = z.object({
  email: z.string().email("Invalid email address"),
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
  });

  const onSubmit = async (data: ForgotPasswordFormValues) => {
    setIsLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const auth = getAuth(app);
      await sendPasswordResetEmail(auth, data.email);
      setSuccess("Password reset email sent! Check your inbox.");
    } catch (err: unknown) {
      console.error("Reset password error:", err);
      if (getErrorCode(err) === "auth/user-not-found") {
        setError("No account found with this email.");
      } else {
        setError("Failed to send reset email. Please try again.");
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
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      <div className="card w-full max-w-sm shadow-2xl bg-base-100">
        <form className="card-body" onSubmit={handleSubmit(onSubmit)}>
          <h2 className="card-title text-2xl font-bold mb-2 justify-center">Reset Password</h2>
          <p className="text-sm text-center text-base-content/70 mb-4">
            Enter your email and we&apos;ll send you instructions to reset your password.
          </p>
          
          {error && (
            <div className="alert alert-error shadow-lg mb-4 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </div>
          )}

          {success && (
            <div className="alert alert-success shadow-lg mb-4 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{success}</span>
            </div>
          )}

          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Email</span>
            </label>
            <input
              type="email"
              placeholder="email@example.com"
              className={`input input-bordered ${errors.email ? 'input-error' : ''}`}
              {...register("email")}
            />
            {errors.email && (
              <label className="label">
                <span className="label-text-alt text-error">{errors.email.message}</span>
              </label>
            )}
          </div>
          
          <div className="form-control mt-4">
            <button 
              type="submit" 
              className="btn btn-primary w-full" 
              disabled={isLoading || success !== null}
            >
              {isLoading ? <span className="loading loading-spinner"></span> : "Send Reset Link"}
            </button>
          </div>
          
          <div className="mt-6 text-center text-sm">
            <Link href="/auth/login" className="link link-primary font-semibold">
              Back to Login
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
