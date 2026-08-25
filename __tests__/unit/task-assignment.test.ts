const mockGet = jest.fn();
const mockWhere = jest.fn();

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: {
    collection: jest.fn(() => ({ where: mockWhere })),
  },
}));

import { findAvailableMaintenancePersonnel } from '@/lib/task-assignment';

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
        ],
      })
      .mockResolvedValueOnce({ docs: [{ data: () => ({ assignedTo: 'busy' }) }] });

    await expect(findAvailableMaintenancePersonnel()).resolves.toEqual([
      expect.objectContaining({ id: 'available', displayName: 'Ava' }),
    ]);
  });
});
