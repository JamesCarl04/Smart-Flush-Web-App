export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds < 0) return '—';
  
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;

  if (hours > 0) {
    if (minutes > 0) {
      return `${hours} hr ${minutes} min`;
    }
    return `${hours} hr`;
  }
  
  if (minutes > 0) {
    return `${minutes} min ${secs} sec`;
  }

  return `${secs} sec`;
}

// Add a helper for MS since our backend often deals with MS
export function formatDurationMs(ms: number | null | undefined): string {
  if (ms == null || ms < 0) return '—';
  return formatDuration(ms / 1000);
}
