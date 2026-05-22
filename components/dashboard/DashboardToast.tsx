'use client';

import { createPortal } from 'react-dom';

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

  return createPortal(
    <div
      className="toast toast-top toast-end pointer-events-none"
      style={{ zIndex: 2147483647 }}
    >
      <div
        className={`alert pointer-events-auto shadow-2xl ${
          kind === 'success' ? 'alert-success' : 'alert-error'
        }`}
      >
        <span>{message}</span>
      </div>
    </div>,
    portalRoot,
  );
}
