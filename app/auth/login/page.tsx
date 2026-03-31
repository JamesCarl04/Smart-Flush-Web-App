"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { signInWithEmailAndPassword, getAuth } from "firebase/auth";
import { app } from "@/lib/firebase";
import { getErrorCode } from "@/lib/error-utils";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useTheme } from "@/contexts/ThemeContext";
import { Sun, Moon, Eye, EyeOff } from "lucide-react";

const loginSchema = z.object({
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
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
  });

  const onSubmit = async (data: LoginFormValues) => {
    setIsLoading(true);
    setError(null);
    try {
      const auth = getAuth(app);
      await signInWithEmailAndPassword(auth, data.email, data.password);
      router.push("/dashboard");
      router.refresh();
    } catch (err: unknown) {
      console.error("Login error:", err);
      const errorCode = getErrorCode(err);
      // Firebase specific error codes
      if (errorCode === "auth/user-not-found" || errorCode === "auth/invalid-credential") {
        setError("Invalid email or password. Please try again.");
      } else if (errorCode === "auth/wrong-password") {
         setError("Wrong password. Please try again.");
      } else if (errorCode === "auth/too-many-requests") {
        setError("Too many attempts. Please try again later.");
      } else {
        setError("Failed to login. Please try again.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-screen p-4 bg-base-200">
      {/* Theme toggle top-right */}
      <button
        onClick={toggleTheme}
        className="btn btn-ghost btn-circle fixed top-4 right-4 z-50"
        aria-label="Toggle theme"
      >
        {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
      </button>
      <div className="card w-full max-w-md shadow-2xl bg-base-100">
        <form className="card-body" onSubmit={handleSubmit(onSubmit)}>
          <h2 className="card-title text-2xl font-bold mb-4 justify-center">Welcome Back</h2>
          
          {error && (
            <div className="alert alert-error shadow-lg mb-4 text-sm">
              <svg xmlns="http://www.w3.org/2000/svg" className="stroke-current shrink-0 h-6 w-6" fill="none" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>
              <span>{error}</span>
            </div>
          )}

          <div className="form-control mb-2">
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
          
          <div className="form-control mb-4">
            <label className="label">
              <span className="label-text">Password</span>
            </label>
            <div className="relative">
              <input
                type={showPassword ? "text" : "password"}
                placeholder="********"
                className={`input input-bordered w-full pr-10 ${errors.password ? 'input-error' : ''}`}
                {...register("password")}
              />
              <button
                type="button"
                className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
                onClick={() => setShowPassword(!showPassword)}
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4 opacity-50" /> : <Eye className="w-4 h-4 opacity-50" />}
              </button>
            </div>
            {errors.password && (
              <label className="label">
                <span className="label-text-alt text-error">{errors.password.message}</span>
              </label>
            )}
            <label className="label mt-1">
              <Link href="/auth/forgot-password" className="label-text-alt link link-hover">
                Forgot password?
              </Link>
            </label>
          </div>
          
          <div className="form-control mt-4">
            <button 
              type="submit" 
              className="btn btn-primary w-full" 
              disabled={isLoading}
            >
              {isLoading ? <span className="loading loading-spinner"></span> : "Login"}
            </button>
          </div>
          
          <div className="divider text-sm text-base-content/60">Or</div>
          
          <div className="text-center text-sm">
            Don&apos;t have an account?{" "}
            <Link href="/auth/register" className="link link-primary font-semibold">
              Register here
            </Link>
          </div>
        </form>
      </div>
    </div>
  );
}
