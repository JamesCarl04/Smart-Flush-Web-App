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
  const method = options?.method?.toUpperCase() ?? 'GET';
  const buildRequest = async (forceRefresh = false) => {
    const token = await user.getIdToken(forceRefresh);
    return fetch(path, {
      ...options,
      headers: {
        ...options?.headers,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
    });
  };

  let res = await buildRequest();

  if (res.status === 401) {
    res = await buildRequest(true);
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const errorMessage =
      (body as { error?: string }).error ?? `Request failed: ${res.status}`;

    if (method === 'GET' && res.status >= 500) {
      console.warn(
        `[apiFetch] ${path} returned ${res.status}: ${errorMessage}`,
      );
      return {
        success: false,
        error: errorMessage,
      } as T;
    }

    throw new Error(
      `${errorMessage} (${res.status} ${res.statusText || 'Error'}: ${path})`,
    );
  }

  return res.json() as Promise<T>;
}
