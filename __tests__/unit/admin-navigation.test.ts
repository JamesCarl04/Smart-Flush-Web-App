import { buildOperationsNavigation } from '@/lib/admin-navigation';

describe('administrator operations navigation', () => {
  it('places Issue Reports between Configuration and Exports only for exact admins', () => {
    expect(buildOperationsNavigation('admin', 4).map((item) => item.name)).toEqual([
      'Tasks',
      'Configuration',
      'Issue Reports',
      'Exports',
    ]);
    expect(buildOperationsNavigation('admin', 4)[2]).toEqual(
      expect.objectContaining({ href: '/issue-reports', badge: 4 }),
    );

    for (const role of ['supervisor', 'maintenance', 'viewer', 'user', null] as const) {
      expect(buildOperationsNavigation(role, 9).map((item) => item.name)).toEqual([
        'Tasks',
        'Configuration',
        'Exports',
      ]);
    }
  });
});
