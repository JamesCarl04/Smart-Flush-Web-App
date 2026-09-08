import type { UserRole } from '@/lib/auth-helpers';

export interface OperationsNavigationItem {
  name: 'Tasks' | 'Configuration' | 'Staff' | 'Issue Reports' | 'Exports';
  href: '/tasks' | '/configuration' | '/staff' | '/issue-reports' | '/reports';
  badge?: number | null;
}

export function buildOperationsNavigation(
  role: UserRole | null,
  pendingIssueReportCount: number,
): OperationsNavigationItem[] {
  return [
    { name: 'Tasks', href: '/tasks' },
    { name: 'Configuration', href: '/configuration' },
    ...(role === 'admin'
      ? [
          { name: 'Staff' as const, href: '/staff' as const },
          {
            name: 'Issue Reports' as const,
            href: '/issue-reports' as const,
            badge: pendingIssueReportCount > 0 ? pendingIssueReportCount : null,
          },
        ]
      : []),
    { name: 'Exports', href: '/reports' },
  ];
}
