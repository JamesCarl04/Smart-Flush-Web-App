import type { UserRole } from '@/lib/auth-helpers';

export interface OperationsNavigationItem {
  name: 'Tasks' | 'Configuration' | 'Issue Reports' | 'Exports';
  href: '/tasks' | '/configuration' | '/issue-reports' | '/reports';
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
      ? [{
          name: 'Issue Reports' as const,
          href: '/issue-reports' as const,
          badge: pendingIssueReportCount > 0 ? pendingIssueReportCount : null,
        }]
      : []),
    { name: 'Exports', href: '/reports' },
  ];
}
