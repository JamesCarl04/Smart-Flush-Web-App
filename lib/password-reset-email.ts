/**
 * Utility to dispatch transactional password reset emails to user inboxes
 * via Google Firebase Authentication Identity Toolkit.
 */
export async function dispatchPasswordResetEmail(
  email: string,
): Promise<{ success: boolean; error?: string }> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  if (!apiKey) {
    console.warn('[PasswordReset] NEXT_PUBLIC_FIREBASE_API_KEY is missing');
    return { success: false, error: 'Firebase API key missing' };
  }

  try {
    const res = await fetch(
      `https://identitytoolkit.googleapis.com/v1/accounts:sendOobCode?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          requestType: 'PASSWORD_RESET',
          email: email.trim().toLowerCase(),
        }),
      },
    );

    if (!res.ok) {
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      const errorMsg = data?.error?.message || 'Failed to dispatch email';
      console.warn('[PasswordReset] sendOobCode failed:', errorMsg);
      return { success: false, error: errorMsg };
    }

    return { success: true };
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : 'Network error';
    console.warn('[PasswordReset] sendOobCode network exception:', errorMsg);
    return { success: false, error: errorMsg };
  }
}
