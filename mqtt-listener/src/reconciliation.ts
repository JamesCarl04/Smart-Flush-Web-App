export interface ReconciliationInput {
  tasks: Array<{ id: string; status: string; completedAtMs: number | null; assignedToIds?: string[] }>;
  technicians: Array<{ id: string; currentTaskId: string | null; isAvailable: boolean }>;
  guards: Array<{ id: string; taskId: string | null }>;
}

export function classifyAutomationRepairs(input: ReconciliationInput) {
  const tasks = new Map(input.tasks.map((task) => [task.id, task]));
  const activeTasks = input.tasks.filter((task) => task.completedAtMs === null && task.status !== 'completed');
  const activeByTechnician = new Map<string, string>();
  for (const task of activeTasks) {
    for (const uid of task.assignedToIds ?? []) {
      if (!activeByTechnician.has(uid)) activeByTechnician.set(uid, task.id);
    }
  }

  return {
    taskRepairs: input.tasks
      .filter((task) => task.completedAtMs !== null && task.status !== 'completed')
      .map((task) => ({ id: task.id, status: 'completed' as const })),
    technicianRepairs: input.technicians.flatMap((technician) => {
      const correctTaskId = activeByTechnician.get(technician.id) ?? null;
      const correctAvailable = correctTaskId === null;
      return technician.currentTaskId !== correctTaskId || technician.isAvailable !== correctAvailable
        ? [{ id: technician.id, currentTaskId: correctTaskId, isAvailable: correctAvailable }]
        : [];
    }),
    guardRepairs: input.guards.flatMap((guard) => {
      const task = guard.taskId ? tasks.get(guard.taskId) : undefined;
      if (!guard.taskId || (task && task.completedAtMs === null && task.status !== 'completed')) return [];
      return [{ id: guard.id, clearTask: true as const, clearPending: task === undefined }];
    }),
  };
}
