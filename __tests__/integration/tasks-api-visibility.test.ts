jest.mock('@/lib/auth-helpers', () => ({
  verifyAuthToken: jest.fn().mockResolvedValue({ uid: 'tech-1', email: 'tech@example.com' }),
  getUserRole: jest.fn().mockResolvedValue('maintenance'),
  requireAdmin: jest.fn(),
}));

import { GET } from '@/app/api/tasks/route';
import { adminDb } from '@/lib/firebase-admin';

function taskDoc(id: string, overrides: Record<string, unknown>) {
  return {
    id,
    data: () => ({
      id,
      deviceId: 'toilet-01',
      triggerType: 'maintenance',
      message: id,
      status: 'unassigned',
      assignedTo: null,
      assignedToIds: [],
      isBroadcast: false,
      createdAt: { seconds: 1 },
      createdBy: 'system:mqtt',
      ...overrides,
    }),
  };
}

describe('maintenance task API visibility', () => {
  it('returns assigned and broadcast tasks but not supervisor-only unassigned work', async () => {
    const get = jest.fn().mockResolvedValue({
      docs: [
        taskDoc('assigned-self', { status: 'assigned', assignedTo: 'tech-1', assignedToIds: ['tech-1'] }),
        taskDoc('assigned-other', { status: 'assigned', assignedTo: 'tech-2', assignedToIds: ['tech-2'] }),
        taskDoc('supervisor-only', { automationTrigger: 'no_water_after_flush', requiresSupervisorAssignment: true }),
        taskDoc('legacy-broadcast', { isBroadcast: true, assignmentType: 'broadcast' }),
      ],
    });
    (adminDb.collection as jest.Mock).mockReturnValue({
      orderBy: jest.fn(() => ({ get })),
    });

    const response = await GET(new Request('http://localhost/api/tasks'));
    const body = (await response.json()) as { data: Array<{ id: string }> };

    expect(response.status).toBe(200);
    expect(body.data.map((task) => task.id).sort()).toEqual([
      'assigned-self',
      'legacy-broadcast',
    ]);
  });
});
