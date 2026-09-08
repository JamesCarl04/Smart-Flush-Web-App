import {
  resolveStaffOperationalStatus,
  type ActiveTaskLike,
  type StaffUserLike,
} from '@/lib/staff-workload';

describe('resolveStaffOperationalStatus', () => {
  const baseUser: StaffUserLike = {
    id: 'user-tech-1',
    uid: 'user-tech-1',
    displayName: 'Juan dela Cruz',
    email: 'juan@sdca.edu.ph',
    active: true,
    isActive: true,
    isOnline: true,
    status: 'online',
    isAvailable: true,
    currentTaskId: null,
  };

  it('returns available when user has no active tasks and is online', () => {
    const result = resolveStaffOperationalStatus(baseUser, []);
    expect(result).toEqual({
      currentTaskId: null,
      activeTask: null,
      isAvailable: true,
      isOnline: true,
      status: 'available',
    });
  });

  it('matches active task by user.currentTaskId', () => {
    const user = { ...baseUser, currentTaskId: 'task-101' };
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-101',
        status: 'assigned',
        location: 'Annex 3F',
        message: 'Sensor failure',
        triggerType: 'sensor_fault',
      },
    ];

    const result = resolveStaffOperationalStatus(user, tasks);
    expect(result.status).toBe('on_task');
    expect(result.currentTaskId).toBe('task-101');
    expect(result.isAvailable).toBe(false);
    expect(result.activeTask).toEqual({
      id: 'task-101',
      location: 'Annex 3F',
      message: 'Sensor failure',
      status: 'assigned',
      triggerType: 'sensor_fault',
    });
  });

  it('matches active task by assignedTo UID', () => {
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-102',
        status: 'pending',
        assignedTo: 'user-tech-1',
        location: 'Main Ground',
        message: 'Flush leak',
      },
    ];

    const result = resolveStaffOperationalStatus(baseUser, tasks);
    expect(result.status).toBe('on_task');
    expect(result.currentTaskId).toBe('task-102');
  });

  it('matches active task by assignedTo email case-insensitively', () => {
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-103',
        status: 'assigned',
        assignedTo: 'JUAN@SDCA.EDU.PH',
        location: 'Library Restroom',
      },
    ];

    const result = resolveStaffOperationalStatus(baseUser, tasks);
    expect(result.status).toBe('on_task');
    expect(result.currentTaskId).toBe('task-103');
  });

  it('matches active task by assignedToIds containing UID or email', () => {
    const tasksUid: ActiveTaskLike[] = [
      {
        id: 'task-multi-uid',
        status: 'assigned',
        assignedToIds: ['other-tech', 'user-tech-1'],
      },
    ];
    expect(resolveStaffOperationalStatus(baseUser, tasksUid).status).toBe('on_task');

    const tasksEmail: ActiveTaskLike[] = [
      {
        id: 'task-multi-email',
        status: 'assigned',
        assignedToIds: ['juan@sdca.edu.ph'],
      },
    ];
    expect(resolveStaffOperationalStatus(baseUser, tasksEmail).status).toBe('on_task');
  });

  it('matches active task by acknowledgedBy dictionary keys', () => {
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-ack',
        status: 'acknowledged',
        acknowledgedBy: { 'user-tech-1': Date.now() },
      },
    ];

    const result = resolveStaffOperationalStatus(baseUser, tasks);
    expect(result.status).toBe('on_task');
    expect(result.currentTaskId).toBe('task-ack');
  });

  it('matches active task by recheckedBy UID or email', () => {
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-recheck',
        status: 'rechecking',
        recheckedBy: 'juan@sdca.edu.ph',
      },
    ];

    const result = resolveStaffOperationalStatus(baseUser, tasks);
    expect(result.status).toBe('on_task');
    expect(result.currentTaskId).toBe('task-recheck');
  });

  it('discards stale currentTaskId when task is completed', () => {
    const user = { ...baseUser, currentTaskId: 'task-completed-old' };
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-completed-old',
        status: 'completed',
        completedAt: 1234567,
        assignedTo: 'user-tech-1',
      },
    ];

    const result = resolveStaffOperationalStatus(user, tasks);
    expect(result.status).toBe('available');
    expect(result.currentTaskId).toBeNull();
    expect(result.isAvailable).toBe(true);
  });

  it('discards stale currentTaskId when task has completedAt set despite non-completed status', () => {
    const user = { ...baseUser, currentTaskId: 'task-done-timestamp' };
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-done-timestamp',
        status: 'pending',
        completedAt: { toMillis: () => 1000 },
      },
    ];

    const result = resolveStaffOperationalStatus(user, tasks);
    expect(result.status).toBe('available');
    expect(result.currentTaskId).toBeNull();
    expect(result.isAvailable).toBe(true);
  });

  it('discards stale currentTaskId when task was deleted', () => {
    const user = { ...baseUser, currentTaskId: 'deleted-task-999' };
    const result = resolveStaffOperationalStatus(user, []);
    expect(result.status).toBe('available');
    expect(result.currentTaskId).toBeNull();
    expect(result.isAvailable).toBe(true);
  });

  it('does not match pending broadcast task before acknowledgment', () => {
    const broadcastTask: ActiveTaskLike = {
      id: 'task-broadcast-1',
      status: 'pending',
      isBroadcast: true,
      assignmentType: 'broadcast',
      assignedTo: null,
      assignedToIds: [],
    };

    const result = resolveStaffOperationalStatus(baseUser, [broadcastTask]);
    expect(result.status).toBe('available');
    expect(result.currentTaskId).toBeNull();
    expect(result.isAvailable).toBe(true);
  });

  it('matches broadcast task once acknowledged by technician', () => {
    const broadcastTask: ActiveTaskLike = {
      id: 'task-broadcast-1',
      status: 'acknowledged',
      isBroadcast: true,
      assignmentType: 'broadcast',
      assignedTo: null,
      assignedToIds: [],
      acknowledgedBy: { 'user-tech-1': Date.now() },
    };

    const result = resolveStaffOperationalStatus(baseUser, [broadcastTask]);
    expect(result.status).toBe('on_task');
    expect(result.currentTaskId).toBe('task-broadcast-1');
  });

  it('returns offline when user is inactive or status is offline without active task', () => {
    const offlineUser = { ...baseUser, status: 'offline', isOnline: false };
    const resOffline = resolveStaffOperationalStatus(offlineUser, []);
    expect(resOffline.status).toBe('offline');
    expect(resOffline.isAvailable).toBe(false);
    expect(resOffline.isOnline).toBe(false);

    const inactiveUser = { ...baseUser, active: false };
    const resInactive = resolveStaffOperationalStatus(inactiveUser, []);
    expect(resInactive.status).toBe('offline');
    expect(resInactive.isAvailable).toBe(false);
  });

  it('prioritizes active task even if user was marked offline', () => {
    const offlineUserWithTask = { ...baseUser, status: 'offline', isOnline: false };
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-live',
        status: 'assigned',
        assignedTo: 'user-tech-1',
      },
    ];

    const result = resolveStaffOperationalStatus(offlineUserWithTask, tasks);
    expect(result.status).toBe('on_task');
    expect(result.currentTaskId).toBe('task-live');
  });

  it('handles Firestore DocumentSnapshot with .data() method', () => {
    const mockDocSnapshot = {
      id: 'doc-user-1',
      data: () => ({
        displayName: 'Doc Tech',
        email: 'doctech@sdca.edu.ph',
        status: 'online',
        active: true,
      }),
    };

    const result = resolveStaffOperationalStatus(mockDocSnapshot as any, []);
    expect(result.status).toBe('available');
    expect(result.isAvailable).toBe(true);
  });

  it('falls back from location to restroomName if location is not set', () => {
    const user = { ...baseUser, currentTaskId: 'task-restroom' };
    const tasks: ActiveTaskLike[] = [
      {
        id: 'task-restroom',
        status: 'assigned',
        restroomName: 'Ground Floor Restroom',
      },
    ];

    const result = resolveStaffOperationalStatus(user, tasks);
    expect(result.activeTask?.location).toBe('Ground Floor Restroom');
  });

  it('reports isOnline: false when user is deactivated even if they have an active task', () => {
    const deactivatedUser = { ...baseUser, active: false, isActive: false, status: 'inactive' };
    const tasks: ActiveTaskLike[] = [
      { id: 'task-legacy', status: 'assigned', assignedTo: 'user-tech-1' },
    ];
    const result = resolveStaffOperationalStatus(deactivatedUser, tasks);
    expect(result.status).toBe('on_task');
    expect(result.isOnline).toBe(false);
  });

  it('prioritizes matching userCurrentTaskId over another task in activeTasks', () => {
    const user = { ...baseUser, currentTaskId: 'task-active-2' };
    const tasks: ActiveTaskLike[] = [
      { id: 'task-active-1', status: 'assigned', assignedTo: 'user-tech-1', message: 'First' },
      { id: 'task-active-2', status: 'assigned', assignedTo: 'user-tech-1', message: 'Second' },
    ];
    const result = resolveStaffOperationalStatus(user, tasks);
    expect(result.currentTaskId).toBe('task-active-2');
    expect(result.activeTask?.message).toBe('Second');
  });
});
