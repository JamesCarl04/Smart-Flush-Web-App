import { Suspense } from 'react';
import { ResetPasswordForm } from './ResetPasswordForm';

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-base-200">
          <span className="loading loading-spinner loading-lg"></span>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
