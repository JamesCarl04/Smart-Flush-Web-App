'use client';

import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import toast from 'react-hot-toast';
import { ShieldCheck, Eye, EyeOff } from 'lucide-react';
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
}[] = [
  {
    key: 'criticalAlerts',
    label: 'Critical Alerts',
    description: 'P0 issues (data loss, device down)',
  },
  {
    key: 'highPriorityAlerts',
    label: 'High Priority Alerts',
    description: 'P1 issues (major feature broken)',
  },
  {
    key: 'dailySummaryEmail',
    label: 'Daily Summary Email',
    description: 'End-of-day usage report',
  },
  {
    key: 'weeklyReportEmail',
    label: 'Weekly Report Email',
    description: 'Sent every Monday 8:00 AM',
  },
];

// ── Page ──────────────────────────────────────────────────────────────────────
export default function ProfilePage() {
  const {
    user,
    notifPrefs,
    loading,
    updateProfile,
    changePassword,
    updateNotifications,
  } = useProfile();

  // ── Show/hide toggles for password fields ────────────────────────────────
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // ── Per-toggle "Saved" feedback ──────────────────────────────────────────
  const [savedKey, setSavedKey] = useState<keyof NotificationPrefs | null>(
    null,
  );

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
      resetAccount(data); // clear dirty flag
      toast.success('Profile updated');
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
      toast.success('Password updated');
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
      toast.success('Notification preference saved');
      setTimeout(() => setSavedKey(null), 2000);
    } catch {
      toast.error('Failed to save preference');
    }
  };

  // ── Avatar initials ──────────────────────────────────────────────────────
  const initials = (user?.displayName || user?.email || 'U')
    .split(' ')
    .map((w) => w[0])
    .join('')
    .toUpperCase()
    .slice(0, 2);

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8 space-y-8 pb-20">
      <div>
        <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
          Profile &amp; Settings
        </h1>
        <p className="text-base-content/60 mt-1 text-sm">
          Manage your account, security, and notification preferences.
        </p>
      </div>

      {/* ── SECTION A: Profile Hero ────────────────────────────────────────── */}
      <div className="card bg-gradient-to-br from-primary/15 to-secondary/10 border border-base-200 shadow-xl">
        <div className="card-body flex flex-col sm:flex-row items-center gap-6">
          {/* Avatar */}
          <div className="avatar placeholder shrink-0">
            <div className="bg-primary text-primary-content rounded-full w-20 h-20 flex items-center justify-center ring-4 ring-primary/30">
              <span className="text-2xl font-bold">{initials}</span>
            </div>
          </div>

          <div className="text-center sm:text-left space-y-1">
            {loading ? (
              <>
                <div className="skeleton h-6 w-40 mb-1" />
                <div className="skeleton h-4 w-56" />
              </>
            ) : (
              <>
                <p className="text-xl font-bold text-base-content">
                  {user?.displayName || '—'}
                </p>
                <p className="text-sm text-base-content/60">{user?.email}</p>
              </>
            )}
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start pt-1">
              <span className="badge badge-primary gap-1 font-semibold">
                <ShieldCheck className="w-3 h-3" /> Operator
              </span>
              <span className="badge badge-success badge-outline gap-1 text-xs font-medium">
                <span className="w-1.5 h-1.5 rounded-full bg-success inline-block" />{' '}
                Active
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION B: Account Details ────────────────────────────────────── */}
      <div className="card bg-base-100 border border-base-200 shadow-xl">
        <div className="card-body">
          <h2 className="card-title mb-2">Account Details</h2>

          <form onSubmit={handleAccount(onSaveAccount)} className="space-y-4">
            <div className="form-control w-full">
              <label className="label" htmlFor="displayName">
                <span className="label-text font-medium">Display Name</span>
              </label>
              <input
                id="displayName"
                type="text"
                className={`input input-bordered w-full ${errAccount.displayName ? 'input-error' : ''}`}
                {...regAccount('displayName')}
              />
              {errAccount.displayName && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errAccount.displayName.message}
                  </span>
                </label>
              )}
            </div>

            <div className="form-control w-full">
              <label className="label" htmlFor="email">
                <span className="label-text font-medium">Email Address</span>
              </label>
              <input
                id="email"
                type="email"
                className={`input input-bordered w-full ${errAccount.email ? 'input-error' : ''}`}
                {...regAccount('email')}
              />
              {errAccount.email && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errAccount.email.message}
                  </span>
                </label>
              )}
            </div>

            <div className="card-actions justify-end pt-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!isDirtyAccount || isSavingAccount}
              >
                {isSavingAccount && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                Save Changes
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── SECTION C: Change Password ────────────────────────────────────── */}
      <div className="card bg-base-100 border border-base-200 shadow-xl">
        <div className="card-body">
          <h2 className="card-title mb-2">Change Password</h2>

          <form
            onSubmit={handlePassword(onChangePassword)}
            className="space-y-4"
          >
            {/* Current Password */}
            <div className="form-control w-full">
              <label className="label" htmlFor="currentPassword">
                <span className="label-text font-medium">Current Password</span>
              </label>
              <div className="relative">
                <input
                  id="currentPassword"
                  type={showCurrent ? 'text' : 'password'}
                  className={`input input-bordered w-full pr-10 ${errPassword.currentPassword ? 'input-error' : ''}`}
                  placeholder="••••••••"
                  {...regPassword('currentPassword')}
                />
                <button
                  type="button"
                  className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
                  onClick={() => setShowCurrent((v) => !v)}
                  tabIndex={-1}
                >
                  {showCurrent ? (
                    <EyeOff className="w-4 h-4 opacity-50" />
                  ) : (
                    <Eye className="w-4 h-4 opacity-50" />
                  )}
                </button>
              </div>
              {errPassword.currentPassword && (
                <label className="label">
                  <span className="label-text-alt text-error">
                    {errPassword.currentPassword.message}
                  </span>
                </label>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {/* New Password */}
              <div className="form-control w-full">
                <label className="label" htmlFor="newPassword">
                  <span className="label-text font-medium">New Password</span>
                </label>
                <div className="relative">
                  <input
                    id="newPassword"
                    type={showNew ? 'text' : 'password'}
                    className="input input-bordered w-full pr-10"
                    placeholder="••••••••"
                    {...regPassword('newPassword')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
                    onClick={() => setShowNew((v) => !v)}
                    tabIndex={-1}
                  >
                    {showNew ? (
                      <EyeOff className="w-4 h-4 opacity-50" />
                    ) : (
                      <Eye className="w-4 h-4 opacity-50" />
                    )}
                  </button>
                </div>
                {errPassword.newPassword && (
                  <label className="label">
                    <span className="label-text-alt text-error">
                      {errPassword.newPassword.message}
                    </span>
                  </label>
                )}
              </div>

              {/* Confirm Password */}
              <div className="form-control w-full">
                <label className="label" htmlFor="confirmPassword">
                  <span className="label-text font-medium">
                    Confirm New Password
                  </span>
                </label>
                <div className="relative">
                  <input
                    id="confirmPassword"
                    type={showConfirm ? 'text' : 'password'}
                    className="input input-bordered w-full pr-10"
                    placeholder="••••••••"
                    {...regPassword('confirmPassword')}
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 btn btn-ghost btn-xs btn-circle"
                    onClick={() => setShowConfirm((v) => !v)}
                    tabIndex={-1}
                  >
                    {showConfirm ? (
                      <EyeOff className="w-4 h-4 opacity-50" />
                    ) : (
                      <Eye className="w-4 h-4 opacity-50" />
                    )}
                  </button>
                </div>
                {errPassword.confirmPassword && (
                  <label className="label">
                    <span className="label-text-alt text-error">
                      {errPassword.confirmPassword.message}
                    </span>
                  </label>
                )}
              </div>
            </div>

            <div className="card-actions justify-end pt-2">
              <button
                type="submit"
                className="btn btn-primary"
                disabled={isSavingPassword}
              >
                {isSavingPassword && (
                  <span className="loading loading-spinner loading-sm" />
                )}
                Update Password
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* ── SECTION D: Notification Preferences ──────────────────────────── */}
      <div className="card bg-base-100 border border-base-200 shadow-xl">
        <div className="card-body">
          <h2 className="card-title mb-4">Notification Preferences</h2>

          <div className="space-y-1 divide-y divide-base-200">
            {NOTIF_ROWS.map(({ key, label, description }) => (
              <div
                key={key}
                className="flex items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="space-y-0.5">
                  <p className="font-medium text-sm">{label}</p>
                  <p className="text-xs text-base-content/50">{description}</p>
                  {savedKey === key && (
                    <p className="text-xs text-success font-medium animate-pulse">
                      Saved ✓
                    </p>
                  )}
                </div>
                {loading ? (
                  <div className="skeleton w-12 h-7 rounded-full shrink-0" />
                ) : (
                  <input
                    type="checkbox"
                    className="toggle toggle-primary shrink-0"
                    checked={notifPrefs[key]}
                    onChange={() => handleToggle(key)}
                  />
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
