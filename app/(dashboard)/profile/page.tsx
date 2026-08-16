'use client';

import { useEffect, useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  Shield,
  Eye,
  EyeOff,
  User,
  Mail,
  Lock,
  Bell,
  CheckCircle2,
  Sparkles,
  Wrench,
  KeyRound,
  Sliders,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/hooks/useProfile';
import type { NotificationPrefs } from '@/types';

// ── Zod schemas ───────────────────────────────────────────────────────────────
const accountSchema = z.object({
  displayName: z.string().min(2, 'Name must be at least 2 characters'),
  email: z.string().email('Invalid email address'),
});

const passwordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
  })
  .refine((d) => d.newPassword === d.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type AccountFormValues = z.infer<typeof accountSchema>;
type PasswordFormValues = z.infer<typeof passwordSchema>;

// ── Notification row config ───────────────────────────────────────────────────
const NOTIF_ROWS: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
  badge: string;
}[] = [
  {
    key: 'criticalAlerts',
    label: 'Critical System Alerts',
    description: 'Immediate P0 notifications for device offline, water leakage, or hardware failure',
    badge: 'P0 Urgent',
  },
  {
    key: 'highPriorityAlerts',
    label: 'High-Priority Dispatches',
    description: 'P1 alerts when UV-C cycle requires attention or flush threshold is exceeded',
    badge: 'P1 High',
  },
  {
    key: 'dailySummaryEmail',
    label: 'Daily Telemetry Summary',
    description: 'End-of-day digest detailing total water savings, flushes, and sanitization cycles',
    badge: 'Daily',
  },
  {
    key: 'weeklyReportEmail',
    label: 'Weekly Executive Report',
    description: 'Comprehensive weekly analytics report sent every Monday at 8:00 AM',
    badge: 'Weekly',
  },
];

// ── Page Component ───────────────────────────────────────────────────────────
export default function ProfilePage() {
  const {
    user,
    notifPrefs,
    loading: profileLoading,
    updateProfile,
    changePassword,
    updateNotifications,
  } = useProfile();

  const [userRole, setUserRole] = useState<string>('Operator');
  const [roleLoading, setRoleLoading] = useState(true);

  // ── Show/hide toggles for password fields ────────────────────────────────
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Per-toggle "Saved" feedback ──────────────────────────────────────────
  const [savedKey, setSavedKey] = useState<keyof NotificationPrefs | null>(
    null,
  );

  // Fetch user role from Firestore
  useEffect(() => {
    let cancelled = false;

    const fetchRole = async () => {
      if (!user) {
        if (!cancelled) {
          setUserRole('Operator');
          setRoleLoading(false);
        }
        return;
      }

      try {
        const snap = await getDoc(doc(db, 'users', user.uid));
        if (!cancelled && snap.exists()) {
          const rawRole = (snap.data().role as string | undefined) ?? 'operator';
          if (rawRole === 'admin') {
            setUserRole('Admin');
          } else if (rawRole === 'maintenance') {
            setUserRole('Maintenance Technician');
          } else if (rawRole === 'viewer') {
            setUserRole('Viewer');
          } else {
            setUserRole('Operator');
          }
        }
      } catch (err) {
        console.warn('[ProfilePage] Failed to fetch role:', err);
      } finally {
        if (!cancelled) {
          setRoleLoading(false);
        }
      }
    };

    void fetchRole();

    return () => {
      cancelled = true;
    };
  }, [user]);

  // ── Account form ─────────────────────────────────────────────────────────
  const {
    register: regAccount,
    handleSubmit: handleAccount,
    reset: resetAccount,
    formState: {
      errors: errAccount,
      isDirty: isDirtyAccount,
      isSubmitting: isSavingAccount,
    },
  } = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: { displayName: '', email: '' },
  });

  // Populate once user loads
  useEffect(() => {
    if (user) {
      resetAccount({
        displayName: user.displayName ?? '',
        email: user.email ?? '',
      });
    }
  }, [user, resetAccount]);

  const onSaveAccount = async (data: AccountFormValues) => {
    try {
      await updateProfile(data);
      resetAccount(data);
      toast.success('Profile details updated successfully');
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : 'Failed to update profile';
      toast.error(message);
    }
  };

  // ── Password form ────────────────────────────────────────────────────────
  const {
    register: regPassword,
    handleSubmit: handlePassword,
    reset: resetPassword,
    setError: setPasswordError,
    formState: { errors: errPassword, isSubmitting: isSavingPassword },
  } = useForm<PasswordFormValues>({ resolver: zodResolver(passwordSchema) });

  const onChangePassword = async (data: PasswordFormValues) => {
    try {
      await changePassword({
        currentPassword: data.currentPassword,
        newPassword: data.newPassword,
      });
      resetPassword();
      toast.success('Security password changed successfully');
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setPasswordError('currentPassword', {
          message: 'Current password is incorrect',
        });
      } else {
        toast.error(
          `Failed to change password: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    }
  };

  // ── Notification toggle handler ──────────────────────────────────────────
  const handleToggle = async (key: keyof NotificationPrefs) => {
    const updated: NotificationPrefs = {
      ...notifPrefs,
      [key]: !notifPrefs[key],
    };
    try {
      await updateNotifications(updated);
      setSavedKey(key);
      setTimeout(() => setSavedKey(null), 2500);
    } catch {
      toast.error('Failed to save notification preference');
    }
  };

  // ── Avatar initials ──────────────────────────────────────────────────────
  const initials = useMemo(() => {
    const source = user?.displayName || user?.email || 'Klir User';
    const parts = source.trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
    }
    return source.slice(0, 2).toUpperCase();
  }, [user]);

  const roleBadgeConfig = useMemo(() => {
    switch (userRole) {
      case 'Admin':
        return {
          className: 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-500/30',
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
        };
      case 'Maintenance Technician':
        return {
          className: 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30',
          icon: <Wrench className="w-3.5 h-3.5" />,
        };
      case 'Viewer':
        return {
          className: 'bg-slate-500/15 text-slate-700 dark:text-slate-300 border border-slate-500/30',
          icon: <Shield className="w-3.5 h-3.5" />,
        };
      case 'Operator':
      default:
        return {
          className: 'bg-cyan-500/15 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30',
          icon: <ShieldCheck className="w-3.5 h-3.5" />,
        };
    }
  }, [userRole]);

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8 space-y-8 pb-20 animate-fade-in">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 pb-2 border-b border-base-200">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Account &amp; Profile Settings
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage your credentials, role authorizations, and telemetry email dispatch preferences.
          </p>
        </div>
      </div>

      {/* ── SECTION A: Account Profile Overview Hero ────────────────────── */}
      <div className="card bg-base-100 border border-base-200 shadow-xl overflow-hidden">
        <div className="card-body p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            {/* Avatar with Initials and Ring */}
            <div className="relative shrink-0">
              <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-[#B5121B] to-[#8F0D16] text-white shadow-md ring-4 ring-[#C9A227]/30">
                <span className="text-2xl font-bold tracking-wider">{initials}</span>
              </div>
              <span className="absolute -bottom-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500 ring-2 ring-base-100">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse"></span>
              </span>
            </div>

            {/* Profile Info */}
            <div className="text-center sm:text-left space-y-2 flex-1 min-w-0">
              {profileLoading ? (
                <div className="space-y-2">
                  <div className="skeleton h-6 w-48 mx-auto sm:mx-0"></div>
                  <div className="skeleton h-4 w-64 mx-auto sm:mx-0"></div>
                </div>
              ) : (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 truncate">
                      {user?.displayName || 'Authorized User'}
                    </h2>
                  </div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 flex items-center justify-center sm:justify-start gap-1.5">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span>{user?.email || 'No email attached'}</span>
                  </p>
                </>
              )}

              {/* Role & Status Badges */}
              <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-2">
                <div
                  className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-bold ${roleBadgeConfig.className}`}
                >
                  {roleBadgeConfig.icon}
                  <span>Role: {userRole}</span>
                </div>

                <div className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
                  <span>Active Session</span>
                </div>

                {user?.uid && (
                  <div className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-[11px] font-mono text-slate-400 bg-base-200 border border-base-300">
                    <span>UID: {user.uid.slice(0, 8)}...</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* ── SECTION B: Account Details ────────────────────────────────── */}
        <div className="card bg-base-100 border border-base-200 shadow-xl">
          <div className="card-body p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-base-200 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
                <User className="w-4 h-4" />
              </div>
              <div>
                <h2 className="card-title text-lg font-bold">Personal Information</h2>
                <p className="text-xs text-base-content/60">Update display name and registered email</p>
              </div>
            </div>

            <form onSubmit={handleAccount(onSaveAccount)} className="space-y-4">
              <div className="form-control w-full">
                <label className="label py-1" htmlFor="displayName">
                  <span className="label-text text-xs font-semibold">Display Name</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="h-4 w-4" />
                  </div>
                  <input
                    id="displayName"
                    type="text"
                    className={`input input-bordered w-full pl-9 bg-slate-50/50 dark:bg-slate-950/40 text-sm focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none ${
                      errAccount.displayName ? 'input-error border-rose-500' : ''
                    }`}
                    {...regAccount('displayName')}
                  />
                </div>
                {errAccount.displayName && (
                  <label className="label py-1">
                    <span className="label-text-alt text-rose-500 font-medium">
                      {errAccount.displayName.message}
                    </span>
                  </label>
                )}
              </div>

              <div className="form-control w-full">
                <label className="label py-1" htmlFor="email">
                  <span className="label-text text-xs font-semibold">Email Address</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="h-4 w-4" />
                  </div>
                  <input
                    id="email"
                    type="email"
                    className={`input input-bordered w-full pl-9 bg-slate-50/50 dark:bg-slate-950/40 text-sm focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none ${
                      errAccount.email ? 'input-error border-rose-500' : ''
                    }`}
                    {...regAccount('email')}
                  />
                </div>
                {errAccount.email && (
                  <label className="label py-1">
                    <span className="label-text-alt text-rose-500 font-medium">
                      {errAccount.email.message}
                    </span>
                  </label>
                )}
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="btn btn-sm h-10 px-5 shadow-sm font-semibold bg-[#B5121B] hover:bg-[#8F0D16] text-white border-[#B5121B] hover:border-[#8F0D16]"
                  disabled={!isDirtyAccount || isSavingAccount}
                >
                  {isSavingAccount ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Saving...
                    </>
                  ) : (
                    'Save Changes'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        {/* ── SECTION C: Change Password ────────────────────────────────── */}
        <div className="card bg-base-100 border border-base-200 shadow-xl">
          <div className="card-body p-6">
            <div className="flex items-center gap-2.5 pb-4 border-b border-base-200 mb-4">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
                <KeyRound className="w-4 h-4" />
              </div>
              <div>
                <h2 className="card-title text-lg font-bold">Security &amp; Password</h2>
                <p className="text-xs text-base-content/60">Update login security credentials</p>
              </div>
            </div>

            <form
              onSubmit={handlePassword(onChangePassword)}
              className="space-y-3.5"
            >
              {/* Current Password */}
              <div className="form-control w-full">
                <label className="label py-1" htmlFor="currentPassword">
                  <span className="label-text text-xs font-semibold">Current Password</span>
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="h-4 w-4" />
                  </div>
                  <input
                    id="currentPassword"
                    type={showCurrent ? 'text' : 'password'}
                    className={`input input-bordered w-full pl-9 pr-11 bg-slate-50/50 dark:bg-slate-950/40 text-sm focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none ${
                      errPassword.currentPassword ? 'input-error border-rose-500' : ''
                    }`}
                    placeholder="••••••••••••"
                    {...regPassword('currentPassword')}
                  />
                  <button
                    type="button"
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                    onClick={() => setShowCurrent((v) => !v)}
                    tabIndex={-1}
                    aria-label="Toggle current password"
                  >
                    {showCurrent ? (
                  <EyeOff className="w-4 h-4" />
                ) : (
                  <Eye className="w-4 h-4" />
                )}
                  </button>
                </div>
                {errPassword.currentPassword && (
                  <label className="label py-1">
                    <span className="label-text-alt text-rose-500 font-medium">
                      {errPassword.currentPassword.message}
                    </span>
                  </label>
                )}
              </div>

              {/* New Password & Confirm Password */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="form-control w-full">
                  <label className="label py-1" htmlFor="newPassword">
                    <span className="label-text text-xs font-semibold">New Password</span>
                  </label>
                  <div className="relative">
                    <input
                      id="newPassword"
                      type={showNew ? 'text' : 'password'}
                      className="input input-bordered w-full pr-11 bg-slate-50/50 dark:bg-slate-950/40 text-sm focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none"
                      placeholder="••••••••••••"
                      {...regPassword('newPassword')}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                      onClick={() => setShowNew((v) => !v)}
                      tabIndex={-1}
                      aria-label="Toggle new password"
                    >
                      {showNew ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errPassword.newPassword && (
                    <label className="label py-1">
                      <span className="label-text-alt text-rose-500 font-medium">
                        {errPassword.newPassword.message}
                      </span>
                    </label>
                  )}
                </div>

                <div className="form-control w-full">
                  <label className="label py-1" htmlFor="confirmPassword">
                    <span className="label-text text-xs font-semibold">Confirm Password</span>
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirm ? 'text' : 'password'}
                      className="input input-bordered w-full pr-11 bg-slate-50/50 dark:bg-slate-950/40 text-sm focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none"
                      placeholder="••••••••••••"
                      {...regPassword('confirmPassword')}
                    />
                    <button
                      type="button"
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors focus:outline-none"
                      onClick={() => setShowConfirm((v) => !v)}
                      tabIndex={-1}
                      aria-label="Toggle confirm password"
                    >
                      {showConfirm ? (
                        <EyeOff className="w-4 h-4" />
                      ) : (
                        <Eye className="w-4 h-4" />
                      )}
                    </button>
                  </div>
                  {errPassword.confirmPassword && (
                    <label className="label py-1">
                      <span className="label-text-alt text-rose-500 font-medium">
                        {errPassword.confirmPassword.message}
                      </span>
                    </label>
                  )}
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  className="btn btn-neutral btn-sm h-10 px-5 shadow-sm font-semibold"
                  disabled={isSavingPassword}
                >
                  {isSavingPassword ? (
                    <>
                      <span className="loading loading-spinner loading-xs" />
                      Updating...
                    </>
                  ) : (
                    'Update Password'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      </div>

      {/* ── SECTION D: Email Notification Toggles ──────────────────────── */}
      <div className="card bg-base-100 border border-base-200 shadow-xl">
        <div className="card-body p-6 sm:p-8">
          <div className="flex items-center justify-between pb-4 border-b border-base-200 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h2 className="card-title text-lg font-bold">Email Notification Preferences</h2>
                <p className="text-xs text-base-content/60">
                  Select which automated alerts and operational reports you receive via email
                </p>
              </div>
            </div>
          </div>

          <div className="divide-y divide-base-200">
            {NOTIF_ROWS.map(({ key, label, description, badge }) => (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-base-content">{label}</p>
                    <span className="inline-flex rounded-md bg-base-200 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-base-content/60">
                      {badge}
                    </span>
                    {savedKey === key && (
                      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400 font-semibold animate-fade-in">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Saved
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-base-content/60 leading-relaxed">{description}</p>
                </div>

                <div className="flex items-center shrink-0">
                  {profileLoading ? (
                    <div className="skeleton w-12 h-6 rounded-full" />
                  ) : (
                    <input
                      type="checkbox"
                      className="toggle toggle-sm sm:toggle-md checked:bg-[#B5121B] checked:border-[#B5121B]"
                      checked={notifPrefs[key]}
                      onChange={() => void handleToggle(key)}
                      aria-label={`Toggle ${label}`}
                    />
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
