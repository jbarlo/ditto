"use client";

import { createContext, useContext, ReactNode } from "react";

interface AuthContextValue {
  userId: string | null;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextValue>({
  userId: null,
  isAuthenticated: false,
});

export function useAuth() {
  return useContext(AuthContext);
}

interface AuthProviderProps {
  children: ReactNode;
  userId?: string | null;
}

export function AuthProvider({ children, userId = null }: AuthProviderProps) {
  return (
    <AuthContext.Provider
      value={{
        userId,
        isAuthenticated: userId !== null,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
