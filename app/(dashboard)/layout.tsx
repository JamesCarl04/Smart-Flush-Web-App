'use client';

import React, { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAlerts } from '@/hooks/useAlerts';
import { useAuth } from '@/hooks/useAuth';
import { usePresentationMode } from '@/hooks/usePresentationMode';
import { useTheme } from '@/contexts/ThemeContext';
import {
  Bell,
  LayoutDashboard,
  BarChart3,
  SlidersHorizontal,
  FileText,
  Sun,
  Moon,
  LogOut,
  AlertOctagon,
  AlertTriangle,
  Menu,
  X,
  ChevronRight,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { Toaster } from 'react-hot-toast';

interface NavItem {
  name: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | null;
}

interface NavSection {
  title: string;
  items: NavItem[];
}

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { logout, user, loading } = useAuth();
  const presentationMode = usePresentationMode();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  const notificationsRef = useRef<HTMLDivElement>(null);

  const { alerts, unreadCount } = useAlerts();
  const recentAlerts = alerts.slice(0, 5);

  useEffect(() => {
    if (!loading && !user && !presentationMode) {
      router.replace('/auth/login');
    }
  }, [loading, presentationMode, router, user]);

  // Close mobile sidebar on route change
  useEffect(() => {
    setMobileMenuOpen(false);
    setNotificationsOpen(false);
  }, [pathname]);

  // Close notifications dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        notificationsRef.current &&
        !notificationsRef.current.contains(event.target as Node)
      ) {
        setNotificationsOpen(false);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  const navSections: NavSection[] = [
    {
      title: 'Monitoring',
      items: [
        { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
        { name: 'Analytics', href: '/analytics', icon: BarChart3 },
        {
          name: 'Alerts',
          href: '/alerts',
          icon: Bell,
          badge: unreadCount > 0 ? unreadCount : null,
        },
      ],
    },
    {
      title: 'Operations',
      items: [
        {
          name: 'Configuration',
          href: '/configuration',
          icon: SlidersHorizontal,
        },
        { name: 'Reports', href: '/reports', icon: FileText },
      ],
    },
  ];

  // User details
  const userInitials = user?.displayName
    ? user.displayName
        .split(' ')
        .filter(Boolean)
        .map((w) => w[0])
        .join('')
        .toUpperCase()
        .slice(0, 2)
    : user?.email
      ? user.email.slice(0, 2).toUpperCase()
      : 'OP';

  const userDisplayName =
    user?.displayName ||
    (user?.email ? user.email.split('@')[0] : 'Operator');

  const isAdmin =
    user?.email?.toLowerCase().includes('admin') ||
    user?.displayName?.toLowerCase().includes('admin');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 transition-colors duration-300 dark:bg-[#0b0f19] dark:text-slate-100 flex flex-col">
      {/* ==================================================================== */}
      {/* DESKTOP SIDEBAR                                                      */}
      {/* ==================================================================== */}
      <aside className="hidden lg:fixed lg:inset-y-0 lg:left-0 lg:z-30 lg:flex lg:w-64 lg:flex-col lg:border-r lg:border-slate-200 lg:bg-white transition-colors duration-300 dark:lg:border-slate-800 dark:lg:bg-slate-900">
        {/* Brand Header */}
        <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
          <Link
            href="/dashboard"
            className="flex items-center gap-2 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#B5121B] rounded-md"
          >
            <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
              Klir<span className="text-[#B5121B]">.</span>
            </span>
          </Link>
        </div>

        {/* Grouped Navigation */}
        <div className="flex-1 overflow-y-auto px-3 py-6 space-y-6">
          {navSections.map((section) => (
            <div key={section.title} className="space-y-1.5">
              <h2 className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                {section.title}
              </h2>
              <nav className="space-y-1">
                {section.items.map((item) => {
                  const Icon = item.icon;
                  const isActive =
                    item.href === '/dashboard'
                      ? pathname === '/dashboard' || pathname === '/'
                      : pathname?.startsWith(item.href);

                  return (
                    <Link
                      key={item.name}
                      href={item.href}
                      className={`group flex items-center gap-3 px-3 py-2.5 text-sm rounded-r-lg transition-all duration-150 ${
                        isActive
                          ? 'bg-red-50 text-[#B5121B] font-semibold border-l-2 border-[#B5121B] dark:bg-red-950/40 dark:text-red-400 dark:border-red-500 shadow-xs'
                          : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-2 border-transparent font-medium dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                      }`}
                    >
                      <Icon
                        className={`h-4 w-4 shrink-0 transition-colors ${
                          isActive
                            ? 'text-[#B5121B] dark:text-red-400'
                            : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300'
                        }`}
                      />
                      <span className="truncate">{item.name}</span>
                      {item.badge !== undefined &&
                        item.badge !== null &&
                        item.badge > 0 && (
                          <span className="ml-auto inline-flex items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-600 tabular-nums dark:bg-rose-500/20 dark:text-rose-400">
                            {item.badge}
                          </span>
                        )}
                    </Link>
                  );
                })}
              </nav>
            </div>
          ))}
        </div>

        {/* User Footer Card */}
        <div className="border-t border-slate-200 p-3.5 dark:border-slate-800">
          <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 transition-colors dark:border-slate-800 dark:bg-slate-800/50">
            <Link
              href="/profile"
              className="flex items-center gap-2.5 min-w-0 flex-1 group hover:opacity-85 transition-opacity"
              title="View Operator Profile"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B5121B] text-xs font-bold text-white shadow-xs group-hover:ring-2 group-hover:ring-[#C9A227]/40 transition-all">
                {userInitials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#B5121B] dark:group-hover:text-red-400 transition-colors">
                    {userDisplayName}
                  </p>
                  <span className="inline-flex items-center rounded px-1.5 py-0.5 text-[10px] font-semibold bg-red-50 text-[#B5121B] dark:bg-red-950/80 dark:text-red-300 border border-red-200/60 dark:border-red-800/40">
                    {isAdmin ? 'Admin' : 'Operator'}
                  </span>
                </div>
                <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                  {user?.email || 'operator@klir.local'}
                </p>
              </div>
            </Link>
            <button
              onClick={handleLogout}
              title="Sign Out"
              aria-label="Sign Out"
              className="shrink-0 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-white rounded-lg transition-colors dark:text-slate-400 dark:hover:text-rose-400 dark:hover:bg-slate-800"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* MOBILE DRAWER BACKDROP & SIDEBAR                                     */}
      {/* ==================================================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
          />

          {/* Slide-over panel */}
          <div className="fixed inset-y-0 left-0 flex w-72 max-w-full flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-2xl animate-in slide-in-from-left duration-200">
            {/* Header */}
            <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 px-5 dark:border-slate-800">
              <Link
                href="/dashboard"
                className="flex items-center gap-2"
                onClick={() => setMobileMenuOpen(false)}
              >
                <span className="text-xl font-bold tracking-tight text-slate-900 dark:text-white">
                  Klir<span className="text-[#B5121B]">.</span>
                </span>
              </Link>
              <button
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
                aria-label="Close navigation menu"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Navigation */}
            <div className="flex-1 overflow-y-auto px-3 py-6 space-y-6">
              {navSections.map((section) => (
                <div key={section.title} className="space-y-1.5">
                  <h2 className="px-3 text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                    {section.title}
                  </h2>
                  <nav className="space-y-1">
                    {section.items.map((item) => {
                      const Icon = item.icon;
                      const isActive =
                        item.href === '/dashboard'
                          ? pathname === '/dashboard' || pathname === '/'
                          : pathname?.startsWith(item.href);

                      return (
                        <Link
                          key={item.name}
                          href={item.href}
                          onClick={() => setMobileMenuOpen(false)}
                          className={`group flex items-center gap-3 px-3 py-2.5 text-sm rounded-r-lg transition-all duration-150 ${
                            isActive
                              ? 'bg-red-50 text-[#B5121B] font-semibold border-l-2 border-[#B5121B] dark:bg-red-950/40 dark:text-red-400 dark:border-red-500'
                              : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900 border-l-2 border-transparent font-medium dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200'
                          }`}
                        >
                          <Icon
                            className={`h-4 w-4 shrink-0 ${
                              isActive
                                ? 'text-[#B5121B] dark:text-red-400'
                                : 'text-slate-400 dark:text-slate-500'
                            }`}
                          />
                          <span className="truncate">{item.name}</span>
                          {item.badge !== undefined &&
                            item.badge !== null &&
                            item.badge > 0 && (
                              <span className="ml-auto inline-flex items-center justify-center rounded-full border border-rose-500/20 bg-rose-500/15 px-2 py-0.5 text-xs font-semibold text-rose-600 tabular-nums dark:bg-rose-500/20 dark:text-rose-400">
                                {item.badge}
                              </span>
                            )}
                        </Link>
                      );
                    })}
                  </nav>
                </div>
              ))}
            </div>

            {/* User Footer */}
            <div className="border-t border-slate-200 p-3.5 dark:border-slate-800">
              <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/80 p-2.5 dark:border-slate-800 dark:bg-slate-800/50">
                <Link
                  href="/profile"
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-2.5 min-w-0 flex-1 group hover:opacity-85 transition-opacity"
                  title="View Operator Profile"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[#B5121B] text-xs font-bold text-white shadow-xs group-hover:ring-2 group-hover:ring-[#C9A227]/40 transition-all">
                    {userInitials}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-semibold text-slate-900 dark:text-slate-100 group-hover:text-[#B5121B] dark:group-hover:text-red-400 transition-colors">
                      {userDisplayName}
                    </p>
                    <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">
                      {user?.email || 'operator@klir.local'}
                    </p>
                  </div>
                </Link>
                <button
                  onClick={handleLogout}
                  title="Sign Out"
                  aria-label="Sign Out"
                  className="shrink-0 p-1.5 text-slate-400 hover:text-rose-600 rounded-lg hover:bg-white dark:hover:bg-slate-800"
                >
                  <LogOut className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* MAIN CONTENT WRAPPER                                                 */}
      {/* ==================================================================== */}
      <div className="flex flex-1 flex-col lg:pl-64">
        {/* Top Header */}
        <header className="sticky top-0 z-20 flex h-16 w-full items-center justify-between border-b border-slate-200/80 bg-white/85 px-4 sm:px-6 md:px-8 backdrop-blur-md transition-colors duration-300 dark:border-slate-800/80 dark:bg-slate-900/85">
          {/* Left section: Mobile menu toggle & Active Alerts indicator */}
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg lg:hidden dark:text-slate-400 dark:hover:text-slate-200 dark:hover:bg-slate-800"
              aria-label="Open navigation menu"
            >
              <Menu className="h-5 w-5" />
            </button>

            {unreadCount > 0 && (
              <Link
                href="/alerts"
                className="inline-flex items-center gap-2 rounded-full border border-amber-500/25 bg-amber-500/10 px-3 py-1 text-xs font-medium text-amber-700 hover:bg-amber-500/15 transition-colors dark:border-amber-500/30 dark:bg-amber-500/15 dark:text-amber-400 shadow-xs"
              >
                <span className="relative flex h-2 w-2">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-amber-400 opacity-75"></span>
                  <span className="relative inline-flex h-2 w-2 rounded-full bg-amber-500"></span>
                </span>
                <span>
                  {unreadCount} Active Alert{unreadCount > 1 ? 's' : ''}
                </span>
              </Link>
            )}
          </div>

          {/* Right section: Theme Toggle & Notifications Bell */}
          <div className="flex items-center gap-2 sm:gap-3">
            {/* Theme Toggle Button */}
            <button
              onClick={toggleTheme}
              aria-label={
                theme === 'dark'
                  ? 'Switch to Light Mode'
                  : 'Switch to Dark Mode'
              }
              title={
                theme === 'dark'
                  ? 'Switch to Light Mode'
                  : 'Switch to Dark Mode'
              }
              className="tactile-btn p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
            >
              {theme === 'dark' ? (
                <Sun className="h-5 w-5 text-amber-400" />
              ) : (
                <Moon className="h-5 w-5 text-slate-600" />
              )}
            </button>

            {/* Notifications Dropdown Container */}
            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setNotificationsOpen((prev) => !prev)}
                aria-label="Notifications"
                title={`Notifications (${unreadCount} unread)`}
                className="tactile-btn relative p-2 text-slate-500 hover:text-slate-900 rounded-lg hover:bg-slate-100 transition-colors dark:text-slate-400 dark:hover:text-slate-100 dark:hover:bg-slate-800"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute top-1.5 right-1.5 flex h-2 w-2">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex h-2 w-2 rounded-full bg-rose-500"></span>
                  </span>
                )}
              </button>

              {/* Clean Positioned Notifications Dropdown (Zero Overlap with Button) */}
              {notificationsOpen && (
                <div className="absolute right-0 top-full mt-2.5 w-80 sm:w-96 rounded-xl border border-slate-200 bg-white shadow-2xl transition-all dark:border-slate-800 dark:bg-slate-900 z-50 overflow-hidden animate-fade-in-down">
                  {/* Dropdown Header */}
                  <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 dark:border-slate-800">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                        Alerts &amp; Notifications
                      </span>
                      {unreadCount > 0 && (
                        <span className="rounded-full bg-rose-500/10 px-2 py-0.5 text-[11px] font-semibold text-rose-600 dark:bg-rose-500/20 dark:text-rose-400 border border-rose-500/20 tabular-nums">
                          {unreadCount} unread
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Dropdown Alerts List */}
                  <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/60">
                    {recentAlerts.length === 0 ? (
                      <div className="px-4 py-8 text-center text-xs text-slate-400 dark:text-slate-500">
                        No active alerts at this time.
                      </div>
                    ) : (
                      recentAlerts.map((alert) => {
                        const isCritical = alert.severity === 'critical';
                        const isHigh = alert.severity === 'high';

                        return (
                          <Link
                            key={alert.id}
                            href="/alerts"
                            onClick={() => setNotificationsOpen(false)}
                            className={`flex items-start gap-3 px-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50 ${
                              !alert.acknowledged
                                ? 'bg-red-50/40 dark:bg-red-950/20'
                                : ''
                            }`}
                          >
                            <div className="mt-0.5 shrink-0">
                              {isCritical ? (
                                <AlertOctagon className="h-4 w-4 text-rose-500" />
                              ) : isHigh ? (
                                <AlertTriangle className="h-4 w-4 text-amber-500" />
                              ) : (
                                <Bell className="h-4 w-4 text-sky-500" />
                              )}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-1">
                                <p
                                  className={`truncate text-xs ${
                                    !alert.acknowledged
                                      ? 'font-bold text-slate-900 dark:text-slate-100'
                                      : 'font-medium text-slate-700 dark:text-slate-300'
                                  }`}
                                >
                                  {alert.title}
                                </p>
                                {!alert.acknowledged && (
                                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                                )}
                              </div>
                              <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500 dark:text-slate-400">
                                {alert.description}
                              </p>
                              <p className="mt-1 text-[10px] text-slate-400 dark:text-slate-500 tabular-nums">
                                {formatDistanceToNow(
                                  new Date(alert.timestamp),
                                  {
                                    addSuffix: true,
                                  },
                                )}
                              </p>
                            </div>
                          </Link>
                        );
                      })
                    )}
                  </div>

                  {/* Dropdown Footer */}
                  <div className="border-t border-slate-200 bg-slate-50/80 p-2 text-center dark:border-slate-800 dark:bg-slate-800/50">
                    <Link
                      href="/alerts"
                      onClick={() => setNotificationsOpen(false)}
                      className="inline-flex items-center justify-center gap-1.5 text-xs font-semibold text-[#B5121B] hover:text-[#8F0D16] dark:text-red-400 dark:hover:text-red-300 py-1"
                    >
                      <span>View All System Alerts</span>
                      <ChevronRight className="h-3.5 w-3.5" />
                    </Link>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          {children}
        </main>
      </div>

      <Toaster
        position="top-right"
        containerStyle={{ zIndex: 9999 }}
        toastOptions={{
          duration: 3000,
          className: 'text-xs font-medium rounded-xl border border-slate-200 dark:border-slate-800 shadow-xl dark:bg-slate-900 dark:text-slate-100',
        }}
      />
    </div>
  );
}
