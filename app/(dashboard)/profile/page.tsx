'use client';

import { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import {
  ShieldCheck,
  Shield,
  Mail,
  Bell,
  CheckCircle2,
  Wrench,
  Lock,
} from 'lucide-react';
import { doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useProfile } from '@/hooks/useProfile';
import type { NotificationPrefs } from '@/types';
import packageInfo from '@/package.json';

// ── Notification row config ───────────────────────────────────────────────────
const NOTIF_ROWS: {
  key: keyof NotificationPrefs;
  label: string;
  description: string;
}[] = [
  {
    key: 'criticalAlerts',
    label: 'Critical System Alerts',
    description: 'Immediate notifications for offline devices, water leaks, or hardware alerts',
  },
  {
    key: 'highPriorityAlerts',
    label: 'High-Priority Dispatches',
    description: 'Alerts when UV cleaning needs attention or flush counts exceed limits',
  },
];

// ── Page Component ───────────────────────────────────────────────────────────
export default function ProfilePage() {
  const {
    user,
    notifPrefs,
    loading: profileLoading,
    updateNotifications,
  } = useProfile();

  const [userRole, setUserRole] = useState<string>('Operator');
  const [_roleLoading, _setRoleLoading] = useState(true);

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
          _setRoleLoading(false);
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
          _setRoleLoading(false);
        }
      }
    };

    void fetchRole();

    return () => {
      cancelled = true;
    };
  }, [user]);

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
          <span className="sr-only">
            Manage your credentials, role authorizations, and telemetry email dispatch preferences.
          </span>
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
                <span className="h-2 w-2 rounded-full bg-white"></span>
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

                <div className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1 text-xs font-semibold bg-slate-100 text-slate-700 border border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  <span>Klir Admin Web • v{packageInfo.version}</span>
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

      {/* ── SECTION B: Institutional Security & Provisioning Notice ──────── */}
      <div className="card bg-base-100 border border-base-200 shadow-xl overflow-hidden">
        <div className="card-body p-6 sm:p-8">
          <div className="flex items-start gap-4">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
              <Lock className="h-5 w-5 text-slate-700 dark:text-slate-300" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <h2 className="text-base font-bold text-slate-900 dark:text-slate-100">
                Institutional Security &amp; Access Governance
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Account credentials, administrative roles, and authentication passwords are centrally managed by the Superadmin via the Firebase Console. Self-service credential modification is restricted in accordance with institutional security policies.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ── SECTION C: Alert Notification Toggles ──────────────────────── */}
      <div className="card bg-base-100 border border-base-200 shadow-xl">
        <div className="card-body p-6 sm:p-8">
          <div className="flex items-center justify-between pb-4 border-b border-base-200 mb-2">
            <div className="flex items-center gap-2.5">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-400">
                <Bell className="w-4 h-4" />
              </div>
              <div>
                <h2 className="card-title text-lg font-bold">Notification Preferences</h2>
                <span className="sr-only">
                  Select which automated alerts and operational dispatches you receive.
                </span>
              </div>
            </div>
          </div>

          <div className="divide-y divide-base-200">
            {NOTIF_ROWS.map(({ key, label, description }) => (
              <div
                key={key}
                className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 py-4"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-sm text-base-content">{label}</p>
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
