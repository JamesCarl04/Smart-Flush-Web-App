'use client';

import React, { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut, getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';

interface AuthContextType {
  user: User | null;
  loading: boolean;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const auth = getAuth(app);
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
      
      // SECURITY FIX: Do NOT store ID tokens in regular cookies (XSS vulnerability).
      // Firebase SDK automatically manages authentication tokens internally using:
      // - IndexedDB for secure token storage (not accessible to XSS)
      // - Automatic token refresh via getIdToken(true)
      // - Secure session management
      //
      // The apiFetch() helper in lib/api-client.ts calls user.getIdToken()
      // to get the current token for API requests, ensuring we always have
      // a fresh token (expired tokens are refreshed automatically).
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    const auth = getAuth(app);
    await signOut(auth);
    // Firebase automatically clears internal token storage on logout
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
