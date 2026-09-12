'use client';

import { createPortal } from 'react-dom';
import { Check, AlertCircle } from 'lucide-react';

type DashboardToastKind = 'success' | 'error';

interface DashboardToastProps {
  kind: DashboardToastKind;
  message: string;
}

export function DashboardToast({
  kind,
  message,
}: DashboardToastProps): React.JSX.Element | null {
  const portalRoot =
    typeof document === 'undefined' ? null : document.body;

  if (!portalRoot) {
    return null;
  }

  const isSuccess = kind === 'success';

  return createPortal(
    <div
      className="toast toast-top toast-end pointer-events-none"
      style={{ zIndex: 2147483647 }}
      role="status"
      aria-live="polite"
    >
      <div
        className={`pointer-events-auto flex items-center gap-2.5 px-4 py-3 shadow-xl rounded-xl border text-xs font-semibold ${
          isSuccess
            ? 'bg-white text-slate-900 border-slate-200 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-100'
            : 'bg-rose-50 text-rose-900 border-rose-200 dark:bg-rose-950 dark:border-rose-900 dark:text-rose-200'
        }`}
      >
        {isSuccess ? (
          <Check className="h-4 w-4 shrink-0 text-slate-700 dark:text-slate-300" aria-hidden="true" />
        ) : (
          <AlertCircle className="h-4 w-4 shrink-0 text-rose-600 dark:text-rose-400" aria-hidden="true" />
        )}
        <span>{message}</span>
      </div>
    </div>,
    portalRoot,
  );
}
