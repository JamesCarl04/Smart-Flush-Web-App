import { buildOperationsNavigation } from '@/lib/admin-navigation';

describe('administrator operations navigation', () => {
  it('places Staff and Issue Reports between Configuration and Exports only for exact admins', () => {
    expect(buildOperationsNavigation('admin', 4).map((item) => item.name)).toEqual([
      'Tasks',
      'Configuration',
      'Staff',
      'Issue Reports',
      'Exports',
    ]);
    expect(buildOperationsNavigation('admin', 4)[2]).toEqual(
      expect.objectContaining({ href: '/staff', name: 'Staff' }),
    );
    expect(buildOperationsNavigation('admin', 4)[3]).toEqual(
      expect.objectContaining({ href: '/issue-reports', badge: 4 }),
    );

    for (const role of ['supervisor', 'maintenance', 'viewer', 'user', null] as const) {
      const items = buildOperationsNavigation(role, 9);
      expect(items.map((item) => item.name)).toEqual([
        'Tasks',
        'Configuration',
        'Exports',
      ]);
      expect(items.some((item) => item.name === 'Staff')).toBe(false);
    }
  });
});
