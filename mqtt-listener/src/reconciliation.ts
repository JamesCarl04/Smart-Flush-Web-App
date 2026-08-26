export interface ReconciliationInput {
  tasks: ReconciliationTask[];
  technicians: Array<{ id: string; currentTaskId: string | null; isAvailable: boolean }>;
  guards: Array<{ id: string; taskId: string | null }>;
}

export interface ReconciliationTask {
  id: string;
  status: string;
  completedAtMs: number | null;
  assignedTo?: string | null;
  assignedToIds?: string[];
}

export interface TechnicianState {
  id: string;
  currentTaskId: string | null;
  isAvailable: boolean;
}

export function assignedTechnicianIds(task: ReconciliationTask): string[] {
  return Array.from(new Set([
    ...(typeof task.assignedTo === 'string' && task.assignedTo.trim() ? [task.assignedTo.trim()] : []),
    ...(task.assignedToIds ?? []).filter((uid) => typeof uid === 'string' && uid.trim()).map((uid) => uid.trim()),
  ]));
}

function desiredTechnicianState(id: string, tasks: ReconciliationTask[]) {
  const activeTask = tasks.find((task) =>
    task.completedAtMs === null && task.status !== 'completed' && assignedTechnicianIds(task).includes(id));
  return {
    currentTaskId: activeTask?.id ?? null,
    isAvailable: activeTask === undefined,
  };
}

export function revalidateTaskRepair(task: ReconciliationTask) {
  return task.completedAtMs !== null && task.status !== 'completed'
    ? { id: task.id, status: 'completed' as const }
    : null;
}

export function revalidateTechnicianRepair(technician: TechnicianState, tasks: ReconciliationTask[]) {
  const desired = desiredTechnicianState(technician.id, tasks);
  return technician.currentTaskId !== desired.currentTaskId || technician.isAvailable !== desired.isAvailable
    ? { id: technician.id, ...desired }
    : null;
}

export function revalidateGuardRepair(
  guard: { id: string; taskId: string | null },
  task: ReconciliationTask | null,
) {
  if (!guard.taskId || (task && task.completedAtMs === null && task.status !== 'completed')) return null;
  return { id: guard.id, clearTask: true as const, clearPending: task === null };
}

export function classifyAutomationRepairs(input: ReconciliationInput) {
  const tasks = new Map(input.tasks.map((task) => [task.id, task]));
  return {
    taskRepairs: input.tasks
      .flatMap((task) => revalidateTaskRepair(task) ?? []),
    technicianRepairs: input.technicians
      .flatMap((technician) => revalidateTechnicianRepair(technician, input.tasks) ?? []),
    guardRepairs: input.guards.flatMap((guard) => {
      const task = guard.taskId ? tasks.get(guard.taskId) : undefined;
      return revalidateGuardRepair(guard, task ?? null) ?? [];
    }),
  };
}
