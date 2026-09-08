'use client';

import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/hooks/useAuth';
import { apiFetch } from '@/lib/api-client';
import toast from 'react-hot-toast';
import { reauthenticateWithCredential, EmailAuthProvider } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import {
  Users,
  ShieldCheck,
  Wrench,
  UserCheck,
  UserPlus,
  Building2,
  Clock,
  KeyRound,
  MoreVertical,
  Edit2,
  UserX,
  Search,
  X,
  ShieldAlert,
  RotateCw,
  Eye,
  EyeOff,
} from 'lucide-react';

export interface StaffMember {
  id: string;
  uid: string;
  displayName: string;
  email: string;
  role: 'admin' | 'supervisor' | 'technician' | 'maintenance';
  building: string | null;
  shift: string | null;
  active: boolean;
  isAvailable: boolean;
  currentTaskId: string | null;
  activeTask?: {
    id: string;
    location: string | null;
    message: string;
    status: string;
    triggerType: string;
  } | null;
  isOnline?: boolean;
  status?: string;
  createdAt?: string | null;
}

interface NewStaffForm {
  displayName: string;
  email: string;
  role: 'technician' | 'supervisor' | 'admin';
  building: string;
  shift: string;
  sendPasswordReset: boolean;
}

export function formatFacilityLabel(building: string | null | undefined, role: string): string {
  if (building && building.trim()) {
    return building.trim();
  }
  if (role === 'admin' || role === 'supervisor') {
    return 'Campus-Wide (All Facilities)';
  }
  return 'Unassigned Facility';
}

export function formatShiftLabel(shift: string | null | undefined): string {
  const normalized = (shift || '').trim().toLowerCase();
  if (normalized === '1st') return '1st Shift (Morning)';
  if (normalized === '2nd') return '2nd Shift (Evening)';
  if (normalized === '3rd') return '3rd Shift (Night)';
  if (normalized === 'both' || normalized === 'all') return 'All Shifts (Rotational)';
  if (shift && shift.trim()) return `${shift.trim()} Shift`;
  return '1st Shift (Morning)';
}

const INITIAL_FORM: NewStaffForm = {
  displayName: '',
  email: '',
  role: 'technician',
  building: 'Main Campus',
  shift: '1st',
  sendPasswordReset: true,
};

export default function StaffManagementPage() {
  const { user, role, roleLoading } = useAuth();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const [staffList, setStaffList] = useState<StaffMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'supervisor' | 'technician' | 'admin'>('all');
  const [facilityFilter, setFacilityFilter] = useState<'all' | 'SDCA Annex' | 'Main Campus' | 'Central Storage'>('all');
  const [activityTab, setActivityTab] = useState<'all' | 'on_task' | 'available' | 'leadership'>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [creationStep, setCreationStep] = useState<'form' | 'review'>('form');
  const [formValues, setFormValues] = useState<NewStaffForm>(INITIAL_FORM);
  const [formErrors, setFormErrors] = useState<Partial<Record<keyof NewStaffForm, string>>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit Assignment Modal state
  const [editingStaff, setEditingStaff] = useState<StaffMember | null>(null);
  const [editBuilding, setEditBuilding] = useState('');
  const [editShift, setEditShift] = useState('');
  const [isEditSubmitting, setIsEditSubmitting] = useState(false);

  // Deactivation Step-Up Modal state
  const [deactivatingStaff, setDeactivatingStaff] = useState<StaffMember | null>(null);
  const [adminPasswordConfirm, setAdminPasswordConfirm] = useState('');
  const [deactivatePasswordError, setDeactivatePasswordError] = useState<string | null>(null);
  const [isDeactivating, setIsDeactivating] = useState(false);
  const [showDeactivatePassword, setShowDeactivatePassword] = useState(false);

  // Active action menu row id
  const [activeMenuId, setActiveMenuId] = useState<string | null>(null);

  // Fetch staff personnel
  const loadStaff = useCallback(async () => {
    if (!user || role !== 'admin') return;
    setLoading(true);
    try {
      const res = await apiFetch<{ success: boolean; data?: StaffMember[]; error?: string }>(
        '/api/staff',
        user,
      );
      if (res.success && Array.isArray(res.data)) {
        setStaffList(res.data);
      } else {
        toast.error(res.error || 'Failed to load staff roster');
      }
    } catch (err: unknown) {
      console.error('[Staff Page] Error loading staff:', err);
      toast.error(err instanceof Error ? err.message : 'Error fetching staff members');
    } finally {
      setLoading(false);
    }
  }, [role, user]);

  useEffect(() => {
    if (!roleLoading && role === 'admin') {
      void loadStaff();
    }
  }, [loadStaff, role, roleLoading]);

  // Prevent background page and main container scrolling while modal is open
  useEffect(() => {
    const isModalActive = isAddModalOpen || Boolean(editingStaff) || Boolean(deactivatingStaff);
    if (!isModalActive) return;

    const originalBodyOverflow = document.body.style.overflow;
    const originalHtmlOverflow = document.documentElement.style.overflow;
    const mainEl = document.querySelector('main');
    const originalMainOverflow = mainEl ? mainEl.style.overflow : '';

    document.body.style.overflow = 'hidden';
    document.documentElement.style.overflow = 'hidden';
    if (mainEl) {
      mainEl.style.overflow = 'hidden';
    }

    return () => {
      document.body.style.overflow = originalBodyOverflow;
      document.documentElement.style.overflow = originalHtmlOverflow;
      if (mainEl) {
        mainEl.style.overflow = originalMainOverflow;
      }
    };
  }, [isAddModalOpen, editingStaff, deactivatingStaff]);

  // Close menus on outside click or Escape key
  useEffect(() => {
    function handleWindowClick() {
      setActiveMenuId(null);
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setActiveMenuId(null);
        setIsAddModalOpen(false);
        setCreationStep('form');
        setEditingStaff(null);
        setDeactivatingStaff(null);
        setAdminPasswordConfirm('');
        setDeactivatePasswordError(null);
        setShowDeactivatePassword(false);
      }
    }
    window.addEventListener('click', handleWindowClick);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('click', handleWindowClick);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Top 4 KPI calculations & activity segment counts
  const kpis = useMemo(() => {
    const total = staffList.length;
    const supervisors = staffList.filter((s) => s.role === 'supervisor').length;
    const technicians = staffList.filter(
      (s) => s.role === 'technician' || s.role === 'maintenance',
    ).length;
    const available = staffList.filter(
      (s) => s.active && s.isAvailable && !s.currentTaskId,
    ).length;
    const onTask = staffList.filter(
      (s) => (s.role === 'technician' || s.role === 'maintenance') && Boolean(s.currentTaskId),
    ).length;
    const leadership = staffList.filter(
      (s) => s.role === 'admin' || s.role === 'supervisor',
    ).length;
    return { total, supervisors, technicians, available, onTask, leadership };
  }, [staffList]);

  // Filtered roster
  const filteredStaff = useMemo(() => {
    return staffList.filter((person) => {
      const q = searchQuery.trim().toLowerCase();
      const displayName = (person.displayName ?? '').toLowerCase();
      const email = (person.email ?? '').toLowerCase();
      const matchesQuery = !q || displayName.includes(q) || email.includes(q);

      const matchesRole =
        roleFilter === 'all'
          ? true
          : roleFilter === 'technician'
            ? person.role === 'technician' || person.role === 'maintenance'
            : person.role === roleFilter;

      const matchesFacility =
        facilityFilter === 'all' ? true : person.building === facilityFilter;

      const matchesActivity =
        activityTab === 'all'
          ? true
          : activityTab === 'on_task'
            ? Boolean(person.currentTaskId)
            : activityTab === 'available'
              ? person.active && person.isAvailable && !person.currentTaskId
              : person.role === 'admin' || person.role === 'supervisor';

      return matchesQuery && matchesRole && matchesFacility && matchesActivity;
    });
  }, [activityTab, facilityFilter, roleFilter, searchQuery, staffList]);

  // Handle Add Staff Validation & Submission
  const validateForm = (): boolean => {
    const errors: Partial<Record<keyof NewStaffForm, string>> = {};
    if (!formValues.displayName.trim()) {
      errors.displayName = 'Full name is required';
    } else if (formValues.displayName.trim().length < 2) {
      errors.displayName = 'Name must be at least 2 characters';
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!formValues.email.trim()) {
      errors.email = 'Institutional email is required';
    } else if (!emailRegex.test(formValues.email.trim())) {
      errors.email = 'Please provide a valid institutional email address';
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleProceedToReview = (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setCreationStep('review');
  };

  const handleExecuteCreateStaff = async () => {
    if (!validateForm() || !user) return;

    setIsSubmitting(true);
    try {
      const res = await apiFetch<{ success: boolean; uid?: string; resetLink?: string; error?: string }>(
        '/api/staff',
        user,
        {
          method: 'POST',
          body: JSON.stringify({
            displayName: formValues.displayName.trim(),
            email: formValues.email.trim(),
            role: formValues.role,
            building: formValues.building,
            shift: formValues.shift,
            sendPasswordReset: formValues.sendPasswordReset,
          }),
        },
      );

      if (res.success) {
        toast.success(`Staff member ${formValues.displayName} provisioned`);
        setIsAddModalOpen(false);
        setCreationStep('form');
        setFormValues(INITIAL_FORM);
        setFormErrors({});
        await loadStaff();
      } else {
        toast.error(res.error || 'Failed to provision staff member');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error creating account');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Open Edit Modal
  const handleOpenEdit = (staff: StaffMember) => {
    setEditingStaff(staff);
    setEditBuilding(staff.building || 'Main Campus');
    setEditShift(staff.shift || '1st');
    setActiveMenuId(null);
  };

  // Submit Edit Assignment (Role is locked and omitted from payload)
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingStaff || !user) return;

    setIsEditSubmitting(true);
    try {
      const res = await apiFetch<{ success: boolean; error?: string }>(
        `/api/staff/${editingStaff.id}`,
        user,
        {
          method: 'PATCH',
          body: JSON.stringify({
            building: editBuilding,
            shift: editShift,
          }),
        },
      );

      if (res.success) {
        toast.success(`Updated assignment for ${editingStaff.displayName}`);
        setEditingStaff(null);
        await loadStaff();
      } else {
        toast.error(res.error || 'Failed to update staff member');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error updating staff profile');
    } finally {
      setIsEditSubmitting(false);
    }
  };

  // Deactivation Step-Up Handlers
  const handleCloseDeactivateModal = () => {
    setDeactivatingStaff(null);
    setAdminPasswordConfirm('');
    setDeactivatePasswordError(null);
    setShowDeactivatePassword(false);
  };

  const handleOpenDeactivateModal = (staff: StaffMember) => {
    if (user && (user.uid === staff.id || user.uid === staff.uid)) {
      toast.error('Cannot deactivate your own administrator account.');
      setActiveMenuId(null);
      return;
    }
    setActiveMenuId(null);
    setDeactivatingStaff(staff);
    setAdminPasswordConfirm('');
    setDeactivatePasswordError(null);
    setShowDeactivatePassword(false);
  };

  const handleConfirmDeactivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!deactivatingStaff || !user) return;

    if (!adminPasswordConfirm.trim()) {
      setDeactivatePasswordError('Administrator password is required to authorize deactivation.');
      return;
    }

    if (user.uid === deactivatingStaff.id || user.uid === deactivatingStaff.uid) {
      setDeactivatePasswordError('Cannot deactivate your own administrator account.');
      return;
    }

    setIsDeactivating(true);
    setDeactivatePasswordError(null);

    try {
      const currentUser = auth.currentUser || user;
      if (!currentUser || !currentUser.email) {
        throw new Error('Current administrator session is invalid.');
      }

      const credential = EmailAuthProvider.credential(
        currentUser.email,
        adminPasswordConfirm,
      );
      await reauthenticateWithCredential(currentUser, credential);

      const res = await apiFetch<{ success: boolean; error?: string }>(
        `/api/staff/${deactivatingStaff.id}`,
        user,
        {
          method: 'PATCH',
          body: JSON.stringify({ active: false }),
        },
      );

      if (res.success) {
        toast.success(
          `${deactivatingStaff.displayName} deactivated without altering task history`,
        );
        handleCloseDeactivateModal();
        await loadStaff();
      } else {
        setDeactivatePasswordError(res.error || 'Failed to deactivate staff member');
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (
        code === 'auth/wrong-password' ||
        code === 'auth/invalid-credential'
      ) {
        setDeactivatePasswordError('Incorrect administrator password. Please verify your credentials.');
      } else if (code === 'auth/too-many-requests') {
        setDeactivatePasswordError('Too many failed attempts. Access temporarily restricted. Please try again later.');
      } else {
        setDeactivatePasswordError(
          err instanceof Error ? err.message : 'Authentication verification failed. Please try again.',
        );
      }
    } finally {
      setIsDeactivating(false);
    }
  };

  // Safe Direct Reactivation
  const handleReactivateStaff = async (staff: StaffMember) => {
    if (!user) return;
    setActiveMenuId(null);
    try {
      const res = await apiFetch<{ success: boolean; error?: string }>(
        `/api/staff/${staff.id}`,
        user,
        {
          method: 'PATCH',
          body: JSON.stringify({ active: true }),
        },
      );

      if (res.success) {
        toast.success(`${staff.displayName} reactivated`);
        await loadStaff();
      } else {
        toast.error(res.error || 'Failed to reactivate staff member');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Failed to reactivate staff member');
    }
  };

  // Send Password Reset
  const handleSendPasswordReset = async (staff: StaffMember) => {
    if (!user) return;
    setActiveMenuId(null);
    try {
      const res = await apiFetch<{ success: boolean; resetLink?: string; error?: string }>(
        `/api/staff/${staff.id}`,
        user,
        { method: 'POST' },
      );

      if (res.success) {
        toast.success(`Password setup link generated for ${staff.email}`);
      } else {
        toast.error(res.error || 'Failed to generate reset link');
      }
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error generating password link');
    }
  };

  // Render role badge helper (Typography-first, decluttered of repetitive icons)
  const renderRoleBadge = (personRole: string) => {
    if (personRole === 'admin') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-red-50 text-[#B5121B] dark:bg-red-950/60 dark:text-red-300 border border-red-200/80 dark:border-red-900/50">
          Administrator
        </span>
      );
    }
    if (personRole === 'supervisor') {
      return (
        <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-sky-50 text-sky-700 dark:bg-sky-950/60 dark:text-sky-300 border border-sky-200/80 dark:border-sky-900/50">
          Supervisor
        </span>
      );
    }
    return (
      <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-200/80 dark:border-amber-900/50">
        Technician
      </span>
    );
  };

  // Render status badge with static indicators (ZERO pulsing dots, ZERO emojis)
  const renderStatusBadge = (person: StaffMember) => {
    if (!person.active) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-300 dark:border-slate-700">
          <span className="h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500" aria-hidden="true" />
          Deactivated
        </span>
      );
    }

    if (person.currentTaskId) {
      const locationText = person.activeTask?.location ? ` • ${person.activeTask.location}` : '';
      const tooltip = person.activeTask?.message
        ? `Task #${person.currentTaskId}: ${person.activeTask.message} (${person.activeTask.status})`
        : `Active work order #${person.currentTaskId}`;

      return (
        <span
          title={tooltip}
          className="inline-flex max-w-[280px] items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-300 dark:border-amber-800"
        >
          <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" aria-hidden="true" />
          <span className="truncate">
            On Task #{person.currentTaskId.slice(0, 7)}{locationText}
          </span>
        </span>
      );
    }

    if (person.isAvailable) {
      return (
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 dark:bg-emerald-950/50 dark:text-emerald-300 border border-emerald-300 dark:border-emerald-800">
          <span className="h-2 w-2 rounded-full bg-emerald-600 dark:bg-emerald-500" aria-hidden="true" />
          Available
        </span>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
        <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
        Off Duty / Offline
      </span>
    );
  };

  // Guard for role loading or unauthorized access
  if (roleLoading) {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center p-8 text-center" aria-live="polite">
        <div className="loading loading-spinner loading-lg text-[#B5121B]" />
        <p className="mt-4 text-sm font-medium text-slate-600 dark:text-slate-400">
          Validating authorization...
        </p>
      </div>
    );
  }

  if (role !== 'admin') {
    return (
      <div className="flex min-h-[400px] flex-col items-center justify-center rounded-2xl border border-slate-200 bg-white p-8 text-center dark:border-slate-800 dark:bg-slate-900 shadow-sm">
        <div className="mb-4 rounded-full bg-red-50 p-4 text-[#B5121B] dark:bg-red-950/50 dark:text-red-400">
          <ShieldAlert className="h-8 w-8" aria-hidden="true" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">Access Denied</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 max-w-md">
          Staff personnel provisioning and roster management is restricted exclusively to authorized Facility Administrators.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 pb-12">
      {/* 1. Header: Single-row title, subtitle, and primary CTA */}
      <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100">
            Facility Staff Management
          </h1>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Manage facility staff accounts, shift assignments, and live task activity.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => loadStaff()}
            disabled={loading}
            className="btn btn-outline h-12 min-h-[48px] px-4 rounded-xl border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-[#B5121B]"
            aria-label="Refresh staff roster"
          >
            <RotateCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setFormValues(INITIAL_FORM);
              setFormErrors({});
              setCreationStep('form');
              setIsAddModalOpen(true);
            }}
            className="btn btn-primary h-12 min-h-[48px] px-5 rounded-xl bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm inline-flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 transition-all"
          >
            <UserPlus className="h-4 w-4" aria-hidden="true" />
            <span>+ Add Staff Member</span>
          </button>
        </div>
      </header>

      {/* 2. Top 4 KPI Cards */}
      <section aria-label="Staff Key Performance Indicators" className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Staff */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Staff
            </span>
            <div className="h-9 w-9 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
              <Users className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {kpis.total}
            </span>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Registered team members
            </p>
          </div>
        </div>

        {/* Supervisors */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Supervisors
            </span>
            <div className="h-9 w-9 rounded-xl bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 flex items-center justify-center border border-sky-200/60 dark:border-sky-800/40">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {kpis.supervisors}
            </span>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Field shift managers &amp; quality review
            </p>
          </div>
        </div>

        {/* Technicians */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Technicians
            </span>
            <div className="h-9 w-9 rounded-xl bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 flex items-center justify-center border border-amber-200/60 dark:border-amber-800/40">
              <Wrench className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tracking-tight text-slate-900 dark:text-slate-100 tabular-nums">
              {kpis.technicians}
            </span>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Custodial &amp; repair technicians
            </p>
          </div>
        </div>

        {/* Currently Available */}
        <div className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-5 shadow-xs transition-colors">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Currently Available
            </span>
            <div className="h-9 w-9 rounded-xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 flex items-center justify-center border border-emerald-200/60 dark:border-emerald-800/40">
              <UserCheck className="h-5 w-5" aria-hidden="true" />
            </div>
          </div>
          <div className="mt-3">
            <span className="text-3xl font-bold tracking-tight text-emerald-700 dark:text-emerald-400 tabular-nums">
              {kpis.available}
            </span>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              Available for task dispatch
            </p>
          </div>
        </div>
      </section>

      {/* 3. Action Controls: Search input, Role filter, Facility filter */}
      <section aria-label="Staff filters" className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 p-4 shadow-xs">
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" aria-hidden="true" />
            </div>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search staff by name or institutional email..."
              aria-label="Search staff roster"
              className="input input-bordered w-full pl-10 h-12 min-h-[48px] bg-slate-50/70 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 placeholder:text-slate-500 focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 text-sm rounded-xl focus:outline-none"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                aria-label="Clear search query"
              >
                <X className="h-4 w-4" aria-hidden="true" />
              </button>
            )}
          </div>

          {/* Role Filter Dropdown */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="w-full sm:w-44">
              <label htmlFor="filter-role" className="sr-only">Filter by Role</label>
              <select
                id="filter-role"
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as typeof roleFilter)}
                className="select select-bordered w-full h-12 min-h-[48px] bg-slate-50/70 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none"
              >
                <option value="all">All Roles</option>
                <option value="supervisor">Supervisors</option>
                <option value="technician">Technicians</option>
                <option value="admin">Administrators</option>
              </select>
            </div>

            {/* Facility Filter Dropdown */}
            <div className="w-full sm:w-48">
              <label htmlFor="filter-facility" className="sr-only">Filter by Facility</label>
              <select
                id="filter-facility"
                value={facilityFilter}
                onChange={(e) => setFacilityFilter(e.target.value as typeof facilityFilter)}
                className="select select-bordered w-full h-12 min-h-[48px] bg-slate-50/70 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 focus:outline-none"
              >
                <option value="all">All Facilities</option>
                <option value="SDCA Annex">SDCA Annex</option>
                <option value="Main Campus">Main Campus</option>
                <option value="Central Storage">Central Storage</option>
              </select>
            </div>
          </div>
        </div>
      </section>

      {/* 4. Staff Roster Table */}
      <section aria-label="Staff roster table" className="rounded-2xl border border-slate-200/90 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs overflow-hidden">
        {/* Quick Filter Tabs Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800 px-6 py-3.5 bg-slate-50/50 dark:bg-slate-950/40">
          <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Filter staff by activity">
            <button
              type="button"
              role="tab"
              aria-selected={activityTab === 'all'}
              onClick={() => setActivityTab('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activityTab === 'all'
                  ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 shadow-xs border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              All Staff ({kpis.total})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activityTab === 'on_task'}
              onClick={() => setActivityTab('on_task')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activityTab === 'on_task'
                  ? 'bg-white dark:bg-slate-800 text-amber-800 dark:text-amber-300 shadow-xs border border-amber-200 dark:border-amber-800'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Working on Tasks ({kpis.onTask})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activityTab === 'available'}
              onClick={() => setActivityTab('available')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activityTab === 'available'
                  ? 'bg-white dark:bg-slate-800 text-emerald-800 dark:text-emerald-300 shadow-xs border border-emerald-200 dark:border-emerald-800'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Available to Assign ({kpis.available})
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activityTab === 'leadership'}
              onClick={() => setActivityTab('leadership')}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                activityTab === 'leadership'
                  ? 'bg-white dark:bg-slate-800 text-sky-800 dark:text-sky-300 shadow-xs border border-sky-200 dark:border-sky-800'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              Campus Leadership ({kpis.leadership})
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="table w-full border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 text-slate-600 dark:text-slate-400 text-xs font-bold uppercase tracking-wider">
                <th className="py-4 px-6 text-left w-[30%]">Team Member</th>
                <th className="py-4 px-4 text-left w-[15%]">Role</th>
                <th className="py-4 px-4 text-left w-[22%]">Facility &amp; Shift</th>
                <th className="py-4 px-4 text-left w-[25%]">Current Activity</th>
                <th className="py-4 px-6 text-right w-[8%]">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-sm">
              {loading ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="inline-flex items-center gap-2">
                      <div className="loading loading-spinner loading-md text-[#B5121B]" />
                      <span>Loading staff roster...</span>
                    </div>
                  </td>
                </tr>
              ) : filteredStaff.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-12 text-center text-slate-500 dark:text-slate-400">
                    <div className="max-w-xs mx-auto space-y-2">
                      <Users className="h-8 w-8 mx-auto text-slate-400" aria-hidden="true" />
                      <p className="font-semibold text-slate-800 dark:text-slate-200">No staff members match criteria</p>
                      <p className="text-xs">Adjust your search query or role/facility filters.</p>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredStaff.map((person) => {
                  const initials = person.displayName
                    .split(' ')
                    .filter(Boolean)
                    .map((w) => w[0])
                    .join('')
                    .toUpperCase()
                    .slice(0, 2) || 'ST';

                  const isMenuOpen = activeMenuId === person.id;
                  const isSelf = Boolean(user && (user.uid === person.id || user.uid === person.uid));
                  const avatarBg =
                    person.role === 'admin'
                      ? 'bg-[#B5121B]'
                      : person.role === 'supervisor'
                        ? 'bg-[#0284C7]'
                        : 'bg-[#475569]';

                  return (
                    <tr
                      key={person.id}
                      className={`border-l-4 border-l-transparent hover:border-l-[#B5121B] hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-all ${
                        !person.active ? 'opacity-75 bg-slate-50/40 dark:bg-slate-900/40' : ''
                      }`}
                    >
                      {/* Avatar with Role Color & Live Presence Dot, Name, Email */}
                      <td className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="relative flex h-10 w-10 shrink-0 items-center justify-center">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-full text-xs font-bold text-white shadow-xs ${avatarBg}`}>
                              {initials}
                            </div>
                            <span
                              className={`absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-white dark:border-slate-900 ${
                                person.isOnline ? 'bg-emerald-500' : 'bg-slate-400'
                              }`}
                              aria-label={person.isOnline ? 'Online' : 'Offline'}
                              title={person.isOnline ? 'Online' : 'Offline'}
                            />
                          </div>
                          <div className="min-w-0">
                            <div className="font-bold text-slate-900 dark:text-slate-100 truncate">
                              {person.displayName}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400 truncate">
                              {person.email}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Role Badge */}
                      <td className="py-4 px-4">
                        {renderRoleBadge(person.role)}
                      </td>

                      {/* Facility & Shift (Clean typography-first, no repetitive icons) */}
                      <td className="py-4 px-4">
                        <div className="space-y-0.5 text-xs">
                          <div className="font-semibold text-slate-900 dark:text-slate-100">
                            {formatFacilityLabel(person.building, person.role)}
                          </div>
                          <div className="text-[11px] text-slate-500 dark:text-slate-400">
                            {formatShiftLabel(person.shift)}
                          </div>
                        </div>
                      </td>

                      {/* Workload Status */}
                      <td className="py-4 px-4">
                        {renderStatusBadge(person)}
                      </td>

                      {/* Actions Menu */}
                      <td className="py-4 px-6 text-right relative">
                        <div className="relative inline-block text-left">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveMenuId(isMenuOpen ? null : person.id);
                            }}
                            className="h-9 w-9 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-50 dark:hover:bg-slate-700 shadow-xs inline-flex items-center justify-center transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B]"
                            aria-label={`Action menu for ${person.displayName}`}
                            aria-haspopup="true"
                            aria-expanded={isMenuOpen}
                          >
                            <MoreVertical className="h-4 w-4" aria-hidden="true" />
                          </button>

                          {isMenuOpen && (
                            <div
                              onClick={(e) => e.stopPropagation()}
                              className="absolute right-0 mt-1 w-52 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xl z-30 py-1.5 animate-in fade-in zoom-in-95 duration-100"
                              role="menu"
                              aria-orientation="vertical"
                            >
                              <button
                                type="button"
                                onClick={() => handleOpenEdit(person)}
                                className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 focus-visible:bg-slate-100 dark:focus-visible:bg-slate-800 focus-visible:outline-none"
                                role="menuitem"
                              >
                                <Edit2 className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                <span>Edit Assignment</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => void handleSendPasswordReset(person)}
                                className="w-full text-left px-4 py-2.5 text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center gap-2.5 focus-visible:bg-slate-100 dark:focus-visible:bg-slate-800 focus-visible:outline-none"
                                role="menuitem"
                              >
                                <KeyRound className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
                                <span>Send Password Reset</span>
                              </button>

                              <div className="border-t border-slate-100 dark:border-slate-800 my-1" />

                              <button
                                type="button"
                                disabled={person.active && isSelf}
                                onClick={() => {
                                  if (person.active) {
                                    handleOpenDeactivateModal(person);
                                  } else {
                                    void handleReactivateStaff(person);
                                  }
                                }}
                                title={person.active && isSelf ? 'Cannot deactivate your own administrator account' : undefined}
                                className={`w-full text-left px-4 py-2.5 text-xs font-semibold flex items-center gap-2.5 focus-visible:outline-none ${
                                  person.active && isSelf
                                    ? 'text-slate-400 dark:text-slate-500 cursor-not-allowed opacity-60'
                                    : person.active
                                      ? 'text-rose-600 hover:bg-rose-50 dark:text-rose-400 dark:hover:bg-rose-950/40'
                                      : 'text-emerald-600 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-950/40'
                                }`}
                                role="menuitem"
                              >
                                {person.active ? (
                                  <>
                                    <UserX className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Deactivate Account</span>
                                  </>
                                ) : (
                                  <>
                                    <UserCheck className="h-3.5 w-3.5" aria-hidden="true" />
                                    <span>Reactivate Account</span>
                                  </>
                                )}
                              </button>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* 5. Provisioning Modal: + Add Staff Member (Two-Step Flow) */}
      {isAddModalOpen &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-hidden overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-add-staff-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setIsAddModalOpen(false);
                setCreationStep('form');
              }
            }}
          >
            <div className="relative w-full max-w-lg rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 sm:p-6 flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden my-auto">
              {/* Single dismiss affordance (no double handles) */}
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setCreationStep('form');
                }}
                className="absolute top-4 right-4 sm:top-5 sm:right-5 h-11 w-11 sm:h-12 sm:w-12 min-h-[44px] min-w-[44px] sm:min-h-[48px] sm:min-w-[48px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-[#B5121B] z-10"
                aria-label="Close add staff modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>

              {creationStep === 'form' ? (
                <>
                  <div className="mb-3.5 sm:mb-4 shrink-0 pr-8">
                    <h2 id="modal-add-staff-title" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                      Provision New Staff Member
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Create institutional credentials and assign facility duties.
                    </p>
                  </div>

                  <form onSubmit={handleProceedToReview} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                    <div className="space-y-3.5 sm:space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 sm:pr-3 py-1">
                      {/* Full Name */}
                      <div className="form-control">
                        <label className="label py-1" htmlFor="staff-fullname">
                          <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Full Name <span className="text-rose-500">*</span>
                          </span>
                        </label>
                        <input
                          id="staff-fullname"
                          type="text"
                          placeholder="Maria Santos"
                          value={formValues.displayName}
                          onChange={(e) => setFormValues({ ...formValues, displayName: e.target.value })}
                          aria-describedby={formErrors.displayName ? 'staff-fullname-error' : undefined}
                          className={`input input-bordered w-full h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] bg-slate-50/80 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 ${
                            formErrors.displayName ? 'border-rose-500' : ''
                          }`}
                        />
                        {formErrors.displayName && (
                          <p id="staff-fullname-error" className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium">
                            {formErrors.displayName}
                          </p>
                        )}
                      </div>

                      {/* Institutional Email */}
                      <div className="form-control">
                        <label className="label py-1" htmlFor="staff-email">
                          <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Institutional Email (@sdca.edu.ph) <span className="text-rose-500">*</span>
                          </span>
                        </label>
                        <input
                          id="staff-email"
                          type="email"
                          placeholder="msantos@sdca.edu.ph"
                          value={formValues.email}
                          onChange={(e) => setFormValues({ ...formValues, email: e.target.value })}
                          aria-describedby={formErrors.email ? 'staff-email-error' : undefined}
                          className={`input input-bordered w-full h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] bg-slate-50/80 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 ${
                            formErrors.email ? 'border-rose-500' : ''
                          }`}
                        />
                        {formErrors.email && (
                          <p id="staff-email-error" className="text-xs text-rose-600 dark:text-rose-400 mt-1 font-medium">
                            {formErrors.email}
                          </p>
                        )}
                      </div>

                      {/* Role Selector */}
                      <div className="form-control">
                        <label className="label py-1" htmlFor="staff-role">
                          <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                            Institutional Role <span className="text-rose-500">*</span>
                          </span>
                        </label>
                        <select
                          id="staff-role"
                          value={formValues.role}
                          onChange={(e) => setFormValues({ ...formValues, role: e.target.value as NewStaffForm['role'] })}
                          className="select select-bordered w-full h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] bg-slate-50/80 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20"
                        >
                          <option value="technician">Technician</option>
                          <option value="supervisor">Supervisor</option>
                          <option value="admin">Administrator</option>
                        </select>
                      </div>

                      {/* Facility & Shift (Two Columns on sm) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                        <div className="form-control">
                          <label className="label py-1" htmlFor="staff-facility">
                            <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Assigned Facility
                            </span>
                          </label>
                          <select
                            id="staff-facility"
                            value={formValues.building}
                            onChange={(e) => setFormValues({ ...formValues, building: e.target.value })}
                            className="select select-bordered w-full h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] bg-slate-50/80 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20"
                          >
                            <option value="Main Campus">Main Campus</option>
                            <option value="SDCA Annex">SDCA Annex</option>
                            <option value="Central Storage">Central Storage</option>
                          </select>
                        </div>

                        <div className="form-control">
                          <label className="label py-1" htmlFor="staff-shift">
                            <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                              Assigned Shift
                            </span>
                          </label>
                          <select
                            id="staff-shift"
                            value={formValues.shift}
                            onChange={(e) => setFormValues({ ...formValues, shift: e.target.value })}
                            className="select select-bordered w-full h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] bg-slate-50/80 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20"
                          >
                            <option value="1st">1st Shift (06:00 - 14:00)</option>
                            <option value="2nd">2nd Shift (14:00 - 22:00)</option>
                            <option value="3rd">3rd Shift (22:00 - 06:00)</option>
                          </select>
                        </div>
                      </div>

                      {/* Password setup link checkbox */}
                      <div className="pt-1 sm:pt-2">
                        <label className="flex items-start gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={formValues.sendPasswordReset}
                            onChange={(e) => setFormValues({ ...formValues, sendPasswordReset: e.target.checked })}
                            className="checkbox checkbox-primary border-slate-300 dark:border-slate-700 text-[#B5121B] mt-0.5 rounded-md focus:ring-2 focus:ring-[#B5121B]"
                          />
                          <span className="text-xs text-slate-600 dark:text-slate-300">
                            Send Welcome &amp; Password Setup Link to employee email upon provisioning.
                          </span>
                        </label>
                      </div>
                    </div>

                    {/* Submit & Cancel Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setIsAddModalOpen(false);
                          setCreationStep('form');
                        }}
                        className="btn btn-ghost h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] px-4 sm:px-5 rounded-xl text-slate-600 dark:text-slate-300 font-semibold text-sm focus-visible:ring-2 focus-visible:ring-slate-400"
                      >
                        Cancel
                      </button>
                      <button
                        type="submit"
                        className="btn btn-primary h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] px-5 sm:px-6 rounded-xl bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 transition-all"
                      >
                        <span>Review &amp; Continue</span>
                      </button>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className="mb-3.5 sm:mb-4 shrink-0 pr-8">
                    <h2 id="modal-add-staff-title" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                      Confirm New Team Member
                    </h2>
                    <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
                      Please review the details below before provisioning institutional credentials.
                    </p>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      void handleExecuteCreateStaff();
                    }}
                    className="flex flex-col flex-1 min-h-0 overflow-hidden"
                  >
                    <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 sm:pr-3 py-1">
                      {/* High-contrast Review Summary Card */}
                      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/90 dark:bg-slate-950/60 p-4 sm:p-5 space-y-4">
                        <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                          <div className="min-w-0 pr-2">
                            <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                              Full Name
                            </span>
                            <p className="text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                              {formValues.displayName}
                            </p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                              {formValues.email}
                            </p>
                          </div>
                          <div className="shrink-0">
                            {renderRoleBadge(formValues.role)}
                          </div>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 text-xs">
                          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-3">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                              Assigned Facility
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-1 block">
                              {formatFacilityLabel(formValues.building, formValues.role)}
                            </span>
                          </div>
                          <div className="rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white dark:bg-slate-900 p-3">
                            <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider block">
                              Assigned Shift Schedule
                            </span>
                            <span className="font-bold text-slate-900 dark:text-slate-100 text-sm mt-1 block">
                              {formatShiftLabel(formValues.shift)}
                            </span>
                          </div>
                        </div>

                        <div className="pt-3 border-t border-slate-200 dark:border-slate-800 flex items-center gap-2.5 text-xs text-slate-700 dark:text-slate-300">
                          <ShieldCheck className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" aria-hidden="true" />
                          <span>
                            {formValues.sendPasswordReset
                              ? 'Password setup link will be emailed upon creation.'
                              : 'Password setup email will not be sent (manual credential setup).'}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Step 2 Buttons */}
                    <div className="flex items-center justify-end gap-3 pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                      <button
                        type="button"
                        onClick={() => setCreationStep('form')}
                        disabled={isSubmitting}
                        className="btn btn-ghost h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] px-4 sm:px-5 rounded-xl text-slate-600 dark:text-slate-300 font-semibold text-sm focus-visible:ring-2 focus-visible:ring-slate-400"
                      >
                        Back to Edit
                      </button>
                      <button
                        type="submit"
                        disabled={isSubmitting}
                        className="btn btn-primary h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] px-5 sm:px-6 rounded-xl bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 transition-all"
                      >
                        {isSubmitting ? (
                          <span className="loading loading-spinner loading-sm" />
                        ) : (
                          <span>Confirm &amp; Create Account</span>
                        )}
                      </button>
                    </div>
                  </form>
                </>
              )}
            </div>
          </div>,
          document.body
        )}

      {/* 6. Edit Assignment Modal (Role Immutability) */}
      {editingStaff &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-hidden overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-edit-assignment-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) setEditingStaff(null);
            }}
          >
            <div className="relative w-full max-w-md rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 sm:p-6 flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden my-auto">
              <button
                type="button"
                onClick={() => setEditingStaff(null)}
                className="absolute top-4 right-4 sm:top-5 sm:right-5 h-11 w-11 sm:h-12 sm:w-12 min-h-[44px] min-w-[44px] sm:min-h-[48px] sm:min-w-[48px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-[#B5121B] z-10"
                aria-label="Close edit assignment modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="mb-3.5 sm:mb-4 shrink-0 pr-8">
                <h2 id="modal-edit-assignment-title" className="text-lg sm:text-xl font-bold text-slate-900 dark:text-slate-100">
                  Edit Assignment
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                  Update facility and shift assignment for <span className="font-semibold">{editingStaff.displayName}</span>.
                </p>
              </div>

              <form onSubmit={handleSaveEdit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="space-y-3.5 sm:space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 sm:pr-3 py-1">
                  {/* Current Role (Locked) */}
                  <div className="form-control">
                    <label className="label py-1">
                      <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Current Role (Locked)
                      </span>
                    </label>
                    <div className="pt-0.5">
                      {renderRoleBadge(editingStaff.role)}
                    </div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1.5 leading-relaxed">
                      Role permissions are set during account provisioning and cannot be altered via assignment editing.
                    </p>
                  </div>

                  {/* Facility */}
                  <div className="form-control">
                    <label className="label py-1" htmlFor="edit-facility">
                      <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Assigned Facility
                      </span>
                    </label>
                    <select
                      id="edit-facility"
                      value={editBuilding}
                      onChange={(e) => setEditBuilding(e.target.value)}
                      className="select select-bordered w-full h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] bg-slate-50/80 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20"
                    >
                      <option value="Main Campus">Main Campus</option>
                      <option value="SDCA Annex">SDCA Annex</option>
                      <option value="Central Storage">Central Storage</option>
                    </select>
                  </div>

                  {/* Shift */}
                  <div className="form-control">
                    <label className="label py-1" htmlFor="edit-shift">
                      <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Assigned Shift
                      </span>
                    </label>
                    <select
                      id="edit-shift"
                      value={editShift}
                      onChange={(e) => setEditShift(e.target.value)}
                      className="select select-bordered w-full h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] bg-slate-50/80 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20"
                    >
                      <option value="1st">1st Shift (06:00 - 14:00)</option>
                      <option value="2nd">2nd Shift (14:00 - 22:00)</option>
                      <option value="3rd">3rd Shift (22:00 - 06:00)</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-3 pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={() => setEditingStaff(null)}
                    disabled={isEditSubmitting}
                    className="btn btn-ghost h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] px-4 sm:px-5 rounded-xl text-slate-600 dark:text-slate-300 font-semibold text-sm focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isEditSubmitting}
                    className="btn btn-primary h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] px-5 sm:px-6 rounded-xl bg-[#B5121B] hover:bg-[#8F0D16] text-white border-none shadow-md font-semibold text-sm focus-visible:ring-2 focus-visible:ring-[#B5121B] focus-visible:ring-offset-2 transition-all"
                  >
                    {isEditSubmitting ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      <span>Save Changes</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}

      {/* 7. Deactivation Step-Up Authentication Modal */}
      {deactivatingStaff &&
        mounted &&
        createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs animate-fade-in overflow-hidden overscroll-contain"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-deactivate-staff-title"
            onClick={(e) => {
              if (e.target === e.currentTarget) handleCloseDeactivateModal();
            }}
          >
            <div className="relative w-full max-w-md rounded-2xl sm:rounded-3xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-2xl p-5 sm:p-6 flex flex-col max-h-[calc(100vh-2rem)] sm:max-h-[calc(100vh-3rem)] overflow-hidden my-auto">
              <button
                type="button"
                onClick={handleCloseDeactivateModal}
                className="absolute top-4 right-4 sm:top-5 sm:right-5 h-11 w-11 sm:h-12 sm:w-12 min-h-[44px] min-w-[44px] sm:min-h-[48px] sm:min-w-[48px] flex items-center justify-center text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-[#B5121B] z-10"
                aria-label="Close deactivate modal"
              >
                <X className="h-5 w-5" aria-hidden="true" />
              </button>

              <div className="mb-4 shrink-0 pr-8 flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-rose-50 text-rose-600 dark:bg-rose-950/60 dark:text-rose-400 border border-rose-200 dark:border-rose-900/50">
                  <ShieldAlert className="h-5 w-5" aria-hidden="true" />
                </div>
                <div>
                  <h2 id="modal-deactivate-staff-title" className="text-lg font-bold text-slate-900 dark:text-slate-100">
                    Deactivate Staff Member
                  </h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                    Step-up authentication required for access revocation.
                  </p>
                </div>
              </div>

              <form onSubmit={handleConfirmDeactivate} className="flex flex-col flex-1 min-h-0 overflow-hidden">
                <div className="space-y-4 overflow-y-auto flex-1 min-h-0 pr-2 sm:pr-3 py-1">
                  {/* Staff Target Card */}
                  <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-950/60 p-3.5 flex items-center justify-between">
                    <div className="min-w-0 pr-2">
                      <p className="text-sm font-bold text-slate-900 dark:text-slate-100 truncate">
                        {deactivatingStaff.displayName}
                      </p>
                      <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                        {deactivatingStaff.email}
                      </p>
                    </div>
                    <div className="shrink-0">
                      {renderRoleBadge(deactivatingStaff.role)}
                    </div>
                  </div>

                  {/* Security Warning Notice */}
                  <div className="rounded-xl border border-amber-200/80 bg-amber-50/80 dark:border-amber-900/50 dark:bg-amber-950/30 p-3 text-xs text-amber-900 dark:text-amber-200">
                    <p className="leading-relaxed">
                      Deactivating this account will immediately revoke all active mobile and web sessions, prevent login, and exclude this staff member from task dispatch. All historical work orders and audit logs will remain 100% preserved.
                    </p>
                  </div>

                  {/* Password Challenge */}
                  <div className="form-control">
                    <label className="label py-1" htmlFor="admin-deactivate-password">
                      <span className="label-text text-xs font-semibold text-slate-700 dark:text-slate-300">
                        Administrator Password <span className="text-rose-500">*</span>
                      </span>
                    </label>
                    <div className="relative">
                      <input
                        id="admin-deactivate-password"
                        type={showDeactivatePassword ? 'text' : 'password'}
                        placeholder="Enter your current admin password"
                        value={adminPasswordConfirm}
                        onChange={(e) => {
                          setAdminPasswordConfirm(e.target.value);
                          if (deactivatePasswordError) setDeactivatePasswordError(null);
                        }}
                        aria-describedby={deactivatePasswordError ? 'deactivate-password-error' : undefined}
                        className={`input input-bordered w-full pr-10 h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] bg-slate-50/80 dark:bg-slate-950/60 border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm rounded-xl focus:border-[#B5121B] focus:ring-2 focus:ring-[#B5121B]/20 ${
                          deactivatePasswordError ? 'border-rose-500' : ''
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => setShowDeactivatePassword((prev) => !prev)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                        aria-label={showDeactivatePassword ? 'Hide password' : 'Show password'}
                      >
                        {showDeactivatePassword ? (
                          <EyeOff className="h-4 w-4" aria-hidden="true" />
                        ) : (
                          <Eye className="h-4 w-4" aria-hidden="true" />
                        )}
                      </button>
                    </div>
                    {deactivatePasswordError && (
                      <p id="deactivate-password-error" className="text-xs text-rose-600 dark:text-rose-400 mt-1.5 font-medium">
                        {deactivatePasswordError}
                      </p>
                    )}
                  </div>
                </div>

                {/* Actions */}
                <div className="flex items-center justify-end gap-3 pt-3 sm:pt-4 mt-3 sm:mt-4 border-t border-slate-100 dark:border-slate-800 shrink-0">
                  <button
                    type="button"
                    onClick={handleCloseDeactivateModal}
                    disabled={isDeactivating}
                    className="btn btn-ghost h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] px-4 sm:px-5 rounded-xl text-slate-600 dark:text-slate-300 font-semibold text-sm focus-visible:ring-2 focus-visible:ring-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={isDeactivating}
                    className="btn h-11 min-h-[44px] sm:h-12 sm:min-h-[48px] px-5 sm:px-6 rounded-xl bg-rose-600 hover:bg-rose-700 text-white border-none shadow-md font-semibold text-sm focus-visible:ring-2 focus-visible:ring-rose-600 focus-visible:ring-offset-2 transition-all"
                  >
                    {isDeactivating ? (
                      <span className="loading loading-spinner loading-sm" />
                    ) : (
                      <span>Authorize &amp; Deactivate</span>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
}
