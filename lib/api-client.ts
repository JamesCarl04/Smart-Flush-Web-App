// lib/api-client.ts
// Thin wrapper around fetch that injects the Firebase Bearer token.
import type { User } from 'firebase/auth';

const GET_COALESCE_TTL_MS = 3_000;
const inFlightGetRequests = new Map<string, Promise<unknown>>();
const recentGetCache = new Map<string, { value: unknown; expiresAtMs: number }>();

function isTestEnv(): boolean {
  return process.env.NODE_ENV === 'test';
}

function getCacheKey(user: User, path: string): string {
  return `${user.uid}:${path}`;
}

function clearUserGetCache(uid: string): void {
  const prefix = `${uid}:`;
  for (const key of Array.from(recentGetCache.keys())) {
    if (key.startsWith(prefix)) {
      recentGetCache.delete(key);
    }
  }
}

/**
 * Authenticated fetch helper.
 * Automatically attaches the current user's ID token as a Bearer header.
 * Coalesces concurrent/recent identical GET requests per user outside test mode.
 * Returns the parsed JSON body, or throws on non-2xx responses.
 */
export async function apiFetch<T = unknown>(
  path: string,
  user: User,
  options?: RequestInit,
): Promise<T> {
  const method = options?.method?.toUpperCase() ?? 'GET';
  const useCoalescing = method === 'GET' && !isTestEnv();
  const key = getCacheKey(user, path);

  if (method !== 'GET') {
    clearUserGetCache(user.uid);
  }

  if (useCoalescing) {
    const cached = recentGetCache.get(key);
    if (cached && Date.now() < cached.expiresAtMs) {
      return cached.value as T;
    }

    const inFlight = inFlightGetRequests.get(key);
    if (inFlight) {
      return inFlight as Promise<T>;
    }
  }

  const execute = async (): Promise<T> => {
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

    const parsed = (await res.json()) as T;
    if (useCoalescing) {
      recentGetCache.set(key, {
        value: parsed,
        expiresAtMs: Date.now() + GET_COALESCE_TTL_MS,
      });
    }
    return parsed;
  };

  if (!useCoalescing) {
    return execute();
  }

  const promise = execute().finally(() => {
    inFlightGetRequests.delete(key);
  });
  inFlightGetRequests.set(key, promise);
  return promise;
}
