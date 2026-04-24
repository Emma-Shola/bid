import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api } from "@/lib/api";
import { stop as stopRealtime } from "@/lib/realtime";
import type { Role, User } from "@/lib/types";

type AuthStatus = "loading" | "authenticated" | "unauthenticated" | "expired";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  status: AuthStatus;
  sessionExpired: boolean;
  login: (username: string, password: string) => Promise<User>;
  register: (input: { username: string; password: string; role: Role; email?: string; fullName?: string }) => Promise<User>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);
const LAST_AUTH_KEY = "zaaa:last-authenticated";

function readLastAuthFlag() {
  if (typeof window === "undefined") return false;
  return window.localStorage.getItem(LAST_AUTH_KEY) === "1";
}

function writeLastAuthFlag(value: boolean) {
  if (typeof window === "undefined") return;
  if (value) {
    window.localStorage.setItem(LAST_AUTH_KEY, "1");
  } else {
    window.localStorage.removeItem(LAST_AUTH_KEY);
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AuthStatus>("loading");

  const loadCurrentUser = useCallback(async () => {
    if (!readLastAuthFlag()) {
      setUser(null);
      setStatus("unauthenticated");
      setLoading(false);
      return;
    }

    try {
      const current = await api.refresh();
      setUser(current);
      setStatus("authenticated");
      writeLastAuthFlag(true);
    } catch (error) {
      setUser(null);
      setStatus(readLastAuthFlag() ? "expired" : "unauthenticated");
      if ((error as Error)?.message?.toLowerCase?.().includes("unauthorized")) {
        writeLastAuthFlag(false);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCurrentUser();
  }, [loadCurrentUser]);

  const login = useCallback(async (username: string, password: string) => {
    const current = await api.login(username, password);
    setUser(current);
    setStatus("authenticated");
    writeLastAuthFlag(true);
    return current;
  }, []);

  const register = useCallback(async (input: { username: string; password: string; role: Role; email?: string; fullName?: string }) => {
    const current = await api.register(input);
    return current;
  }, []);

  const logout = useCallback(async () => {
    try {
      await api.logout();
    } finally {
      stopRealtime();
      setUser(null);
      setStatus("unauthenticated");
      writeLastAuthFlag(false);
    }
  }, []);

  const refresh = useCallback(async () => {
    const current = await api.refresh();
    setUser(current);
    setStatus("authenticated");
    writeLastAuthFlag(true);
  }, []);

  const value = useMemo(
    () => ({
      user,
      loading,
      status,
      sessionExpired: status === "expired",
      login,
      register,
      logout,
      refresh,
    }),
    [user, loading, status, login, register, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
