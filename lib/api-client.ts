// lib/api-client.ts
// Thin wrapper around fetch that injects the Firebase Bearer token.
import type { User } from 'firebase/auth';

/**
 * Authenticated fetch helper.
 * Automatically attaches the current user's ID token as a Bearer header.
 * Returns the parsed JSON body, or throws on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  user: User,
  options?: RequestInit,
): Promise<T> {
  const token = await user.getIdToken();
  const res = await fetch(path, {
    ...options,
    headers: {
      ...options?.headers,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      (body as { error?: string }).error ?? `Request failed: ${res.status}`,
    );
  }

  return res.json() as Promise<T>;
}
