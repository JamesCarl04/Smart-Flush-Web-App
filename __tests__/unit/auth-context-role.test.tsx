/** @jest-environment jsdom */
import { act, renderHook, waitFor } from '@testing-library/react';
import type { ReactNode } from 'react';

const mockOnAuthStateChanged = jest.fn();
const mockSignOut = jest.fn();
const mockApiFetch = jest.fn();

jest.mock('firebase/auth', () => ({
  getAuth: jest.fn(() => ({})),
  onAuthStateChanged: (...args: unknown[]) => mockOnAuthStateChanged(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
}));
jest.mock('@/lib/firebase', () => ({ app: {} }));
jest.mock('@/lib/api-client', () => ({ apiFetch: (...args: unknown[]) => mockApiFetch(...args) }));
jest.mock('js-cookie', () => ({ set: jest.fn(), remove: jest.fn() }));

import { AuthProvider } from '@/contexts/AuthContext';
import { useAuth } from '@/hooks/useAuth';

describe('AuthContext authoritative role', () => {
  beforeEach(() => jest.clearAllMocks());

  it('keeps role loading until authenticated /api/auth/me resolves', async () => {
    let callback: (user: unknown) => void = () => undefined;
    let resolveRole: (value: unknown) => void = () => undefined;
    mockOnAuthStateChanged.mockImplementation((_auth, handler) => { callback = handler; return jest.fn(); });
    mockApiFetch.mockReturnValue(new Promise((resolve) => { resolveRole = resolve; }));
    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => callback({ uid: 'u1', email: 'admin-looking@example.com' }));
    expect(result.current.roleLoading).toBe(true);
    expect(result.current.role).toBeNull();

    await act(async () => resolveRole({ success: true, data: { role: 'supervisor' } }));
    await waitFor(() => expect(result.current.roleLoading).toBe(false));
    expect(result.current.role).toBe('supervisor');
    expect(result.current.roleError).toBeNull();
    expect(mockApiFetch).toHaveBeenCalledWith('/api/auth/me', expect.objectContaining({ uid: 'u1' }));
  });

  it('dispatches presence heartbeat on 60s interval and tab visibility change', async () => {
    jest.useFakeTimers();
    let callback: (user: unknown) => void = () => undefined;
    mockOnAuthStateChanged.mockImplementation((_auth, handler) => { callback = handler; return jest.fn(); });
    mockApiFetch.mockResolvedValue({ success: true, data: { role: 'admin' } });

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    renderHook(() => useAuth(), { wrapper });

    await act(async () => callback({ uid: 'u1', email: 'admin@example.com' }));

    // Advance by 60 seconds
    await act(async () => {
      jest.advanceTimersByTime(60_000);
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/staff/presence',
      expect.objectContaining({ uid: 'u1' }),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ isOnline: true }),
      }),
    );

    // Trigger visibilitychange
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'));
    });

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/staff/presence',
      expect.objectContaining({ uid: 'u1' }),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ isOnline: true }),
      }),
    );

    jest.useRealTimers();
  });

  it('updates presence to offline upon logout before signing out', async () => {
    let callback: (user: unknown) => void = () => undefined;
    mockOnAuthStateChanged.mockImplementation((_auth, handler) => { callback = handler; return jest.fn(); });
    mockApiFetch.mockResolvedValue({ success: true, data: { role: 'admin' } });

    const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
    const { result } = renderHook(() => useAuth(), { wrapper });

    await act(async () => callback({ uid: 'u1', email: 'admin@example.com' }));
    await act(async () => result.current.logout());

    expect(mockApiFetch).toHaveBeenCalledWith(
      '/api/staff/presence',
      expect.objectContaining({ uid: 'u1' }),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ isOnline: false, status: 'offline' }),
      }),
    );
    expect(mockSignOut).toHaveBeenCalled();
  });
});
