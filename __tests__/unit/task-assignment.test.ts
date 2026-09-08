const mockGet = jest.fn();
const mockWhere = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(() => ({ where: mockWhere })),
  },
}));

import {
  findAvailableMaintenancePersonnel,
  getAvailableTechnicians,
} from '@/lib/task-assignment';

describe('findAvailableMaintenancePersonnel', () => {
  beforeEach(() => {
    mockGet.mockReset();
    mockWhere.mockReset();
    mockWhere.mockReturnValue({ get: mockGet });
  });

  it('returns online maintenance technicians who have no active work order', async () => {
    mockGet
      .mockResolvedValueOnce({
        docs: [
          { id: 'available', data: () => ({ displayName: 'Ava', isOnline: true }) },
          { id: 'busy', data: () => ({ name: 'Ben', isOnline: true }) },
          { id: 'offline', data: () => ({ name: 'Ollie', status: 'offline' }) },
          { id: 'stale-done', data: () => ({ name: 'Stale', isOnline: true }) },
        ],
      })
      .mockResolvedValueOnce({ docs: [
        { data: () => ({ assignedTo: 'busy', completedAt: null }) },
        { data: () => ({ assignedTo: 'stale-done', status: 'pending', completedAt: { toMillis: () => 1 } }) },
      ] });

    await expect(findAvailableMaintenancePersonnel()).resolves.toEqual([
      expect.objectContaining({ id: 'available', displayName: 'Ava' }),
      expect.objectContaining({ id: 'stale-done', displayName: 'Stale' }),
    ]);
  });

  it('tolerates legacy isAvailable: false if technician is online and has no active tasks', async () => {
    mockGet
      .mockResolvedValueOnce({
        docs: [
          {
            id: 'legacy-tech',
            data: () => ({
              displayName: 'Legacy Tech',
              email: 'legacy@example.com',
              isOnline: true,
              isAvailable: false, // Stale doc flag
              status: 'online',
              active: true,
            }),
          },
        ],
      })
      .mockResolvedValueOnce({ docs: [] });

    const available = await findAvailableMaintenancePersonnel();
    expect(available).toEqual([
      expect.objectContaining({ id: 'legacy-tech', displayName: 'Legacy Tech' }),
    ]);
  });

  it('excludes technicians busy via email assignment, acknowledgedBy, or recheckedBy', async () => {
    mockGet
      .mockResolvedValueOnce({
        docs: [
          { id: 'tech-email', data: () => ({ email: 'busy@example.com', isOnline: true }) },
          { id: 'tech-ack', data: () => ({ email: 'ack@example.com', isOnline: true }) },
          { id: 'tech-free', data: () => ({ email: 'free@example.com', isOnline: true }) },
        ],
      })
      .mockResolvedValueOnce({
        docs: [
          { data: () => ({ assignedTo: 'BUSY@example.com', completedAt: null }) },
          { data: () => ({ acknowledgedBy: { 'tech-ack': 123 }, completedAt: null }) },
        ],
      });

    const available = await findAvailableMaintenancePersonnel();
    expect(available.map((t) => t.id)).toEqual(['tech-free']);
  });

  it('exports getAvailableTechnicians as an alias', () => {
    expect(getAvailableTechnicians).toBe(findAvailableMaintenancePersonnel);
  });
});
