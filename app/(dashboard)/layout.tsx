'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAlerts } from '@/hooks/useAlerts';
import { useAuth } from '@/hooks/useAuth';
import { useTheme } from '@/contexts/ThemeContext';
import { Bell, User, LogOut, UserCircle } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, toggleTheme } = useTheme();
  const { logout, user } = useAuth();

  const handleLogout = async () => {
    await logout();
    router.push('/auth/login');
  };

  const { alerts, unreadCount } = useAlerts();
  const recentAlerts = alerts.slice(0, 5);

  const navLinks = [
    { name: 'Dashboard', href: '/dashboard' },
    { name: 'Analytics', href: '/analytics' },
    { name: 'Configuration', href: '/configuration' },
    { name: 'Alerts', href: '/alerts' },
    { name: 'Reports', href: '/reports' },
  ];

  return (
    <div className="drawer transition-colors duration-300 lg:drawer-open">
      <input id="my-drawer-2" type="checkbox" className="drawer-toggle" />
      <div className="drawer-content flex min-h-screen flex-col transition-colors duration-300">
        {/* Mobile Navbar */}
        <div className="navbar w-full border-b border-base-200 bg-base-300 transition-colors duration-300 lg:hidden">
          <div className="flex-none">
            <label htmlFor="my-drawer-2" className="btn btn-square btn-ghost">
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" className="inline-block w-6 h-6 stroke-current"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M4 6h16M4 12h16M4 18h16"></path></svg>
            </label>
          </div>
          <div className="flex-1 px-2 mx-2 text-xl font-bold">Smart Flush</div>
          <div className="flex-none">
            <div className="dropdown dropdown-end">
              <div className="tooltip tooltip-left" data-tip={`${unreadCount} unread alerts`}>
                <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
                  <div className="indicator">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && <span className="badge badge-error badge-xs indicator-item"></span>}
                  </div>
                </div>
              </div>
              <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow bg-base-200 rounded-box w-64 border border-base-300">
                <li className="menu-title px-4 py-2 text-xs font-bold uppercase tracking-wider text-base-content/60">Notifications ({unreadCount})</li>
                {recentAlerts.map(alert => (
                  <li key={alert.id}>
                    <Link href="/alerts" className={`flex flex-col items-start gap-1 py-3 ${!alert.acknowledged ? 'bg-base-300/50 font-medium' : ''}`}>
                      <span className="truncate w-full">{alert.title}</span>
                      <span className="text-xs text-base-content/50">{formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}</span>
                    </Link>
                  </li>
                ))}
                <li><Link href="/alerts" className="justify-center text-primary font-medium mt-2">View All Alerts</Link></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Desktop Header */}
        <div className="navbar sticky top-0 z-40 hidden w-full border-b border-base-200 bg-base-100/50 px-8 backdrop-blur-md transition-colors duration-300 lg:flex">
          <div className="flex-1">
            <h1 className="text-xl font-semibold opacity-0">Dashboard</h1>
          </div>
          <div className="flex-none gap-4">
            {/* Theme Toggle */}
            <label className="swap swap-rotate btn btn-ghost btn-circle">
              <input type="checkbox" onChange={toggleTheme} checked={theme === 'dark'} />
              <svg className="swap-off fill-current w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z" /></svg>
              <svg className="swap-on fill-current w-5 h-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z" /></svg>
            </label>

            {/* Notifications Dropdown */}
            <div className="dropdown dropdown-end">
              <div className="tooltip tooltip-bottom" data-tip={`${unreadCount} unread alerts`}>
                <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
                  <div className="indicator">
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && <span className="badge badge-error badge-xs indicator-item"></span>}
                  </div>
                </div>
              </div>
              <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow-xl bg-base-100 rounded-box w-80 border border-base-200">
                <li className="menu-title px-4 py-2 text-xs font-bold uppercase tracking-wider text-base-content/60 border-b border-base-200 mb-2">Alerts ({unreadCount} unread)</li>
                {recentAlerts.length === 0 ? (
                  <li className="p-4 text-center text-base-content/50 pointer-events-none">No recent alerts</li>
                ) : recentAlerts.map(alert => (
                  <li key={alert.id}>
                    <Link href="/alerts" className={`flex flex-col items-start gap-1 py-3 ${!alert.acknowledged ? 'bg-base-200/50' : ''}`}>
                      <div className="flex items-start justify-between w-full">
                        <span className={`truncate w-full block ${!alert.acknowledged ? 'font-bold' : ''}`}>{alert.title}</span>
                        {!alert.acknowledged && <div className="w-2 h-2 rounded-full bg-error shrink-0 mt-1.5 ml-2"></div>}
                      </div>
                      <span className="text-xs text-base-content/50">{formatDistanceToNow(new Date(alert.timestamp), { addSuffix: true })}</span>
                    </Link>
                  </li>
                ))}
                <li className="mt-2 border-t border-base-200 pt-2"><Link href="/alerts" className="justify-center text-primary font-medium">View All Alerts</Link></li>
              </ul>
            </div>

            {/* Profile Dropdown */}
            <div className="dropdown dropdown-end">
              <div tabIndex={0} role="button" className="btn btn-ghost btn-circle avatar bg-base-300">
                <div className="w-10 rounded-full flex items-center justify-center text-base-content">
                  <User className="w-5 h-5 mt-2 ml-2 opacity-50" />
                </div>
              </div>
              <ul tabIndex={0} className="menu menu-sm dropdown-content mt-3 z-[1] p-2 shadow-xl bg-base-100 rounded-box w-56 border border-base-200">
                {/* User info header */}
                <li className="pointer-events-none">
                  <div className="flex flex-col gap-0.5 px-2 py-1">
                    <span className="text-xs text-base-content/50 truncate">{user?.email}</span>
                  </div>
                </li>
                <li className="border-t border-base-200 mt-1 pt-1"><Link href="/profile"><UserCircle className="w-4 h-4 mr-2" /> My Profile</Link></li>
                <li><a className="text-error cursor-pointer" onClick={handleLogout}><LogOut className="w-4 h-4 mr-2" /> Logout</a></li>
              </ul>
            </div>
          </div>
        </div>

        {/* Page content here */}
        <main className="flex-1 overflow-y-auto p-4 transition-colors duration-300 md:p-8">
          {children}
        </main>
      </div>
      <div className="drawer-side">
        <label htmlFor="my-drawer-2" aria-label="close sidebar" className="drawer-overlay"></label>
        <ul className="menu min-h-full w-80 bg-base-200 p-4 text-base-content transition-colors duration-300">
          <li className="mb-4">
            <div className="flex flex-row justify-between items-center bg-transparent hover:bg-transparent cursor-default">
              <span className="text-2xl font-black bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Klir</span>
            </div>
          </li>
          <div className="divider mt-0 mb-2"></div>
          {navLinks.map((link) => (
            <li key={link.name}>
              <Link
                href={link.href}
                className={
                  pathname?.startsWith(link.href)
                    ? 'active bg-primary text-primary-content font-semibold shadow-sm'
                    : 'transition-colors hover:bg-base-300/80'
                }
              >
                {link.name}
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
