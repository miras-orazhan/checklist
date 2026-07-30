import React, { useState, useEffect } from 'react';
import { useGetMe, getGetMeQueryKey } from '@workspace/api-client-react';
import { AuthContext } from './AuthContext';

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem('auth_token'));

  const { data: user, isLoading: isUserLoading, refetch } = useGetMe({
    query: {
      queryKey: getGetMeQueryKey(),
      enabled: !!token,
      retry: false,
    }
  });

  const login = (newToken: string) => {
    localStorage.setItem('auth_token', newToken);
    setToken(newToken);
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
  };

  useEffect(() => {
    if (token) {
      refetch();
    }
  }, [token, refetch]);

  const isLoading = !!token && isUserLoading;

  return (
    <AuthContext.Provider value={{ user: user ?? null, isLoading, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}
