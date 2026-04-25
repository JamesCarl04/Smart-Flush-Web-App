'use client';

import React, { createContext, useEffect, useState } from 'react';
import { onAuthStateChanged, User, signOut, getAuth } from 'firebase/auth';
import { app } from '@/lib/firebase';
import Cookies from 'js-cookie';

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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setUser(user);

      if (user) {
        // We'll just set a dummy token for middleware routing since the actual token
        // can expire and needs reliable refreshing strategies.
        // For a simple middleware token check, any value works.
        const token = await user.getIdToken();
        Cookies.set('auth-token', token, { expires: 1 }); // Expires in 1 day
      } else {
        Cookies.remove('auth-token');
      }

      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const logout = async () => {
    const auth = getAuth(app);
    await signOut(auth);
    Cookies.remove('auth-token');
  };

  return (
    <AuthContext.Provider value={{ user, loading, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export { AuthContext };
