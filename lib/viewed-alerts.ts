// lib/viewed-alerts.ts
const STORAGE_KEY = 'smartflush:viewed-task-alerts';

export function getViewedTaskAlertIds(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function markTaskAlertsViewed(taskIds: string[]): string[] {
  if (typeof window === 'undefined' || taskIds.length === 0) return [];
  try {
    const current = getViewedTaskAlertIds();
    const next = Array.from(new Set([...current, ...taskIds]));
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(
      new CustomEvent('smartflush:task-alerts-viewed', { detail: next }),
    );
    return next;
  } catch (error) {
    console.warn('[ViewedAlerts] Failed to save viewed task alerts:', error);
    return [];
  }
}
