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
});
