import { createContext, useContext, useCallback, type ReactNode } from "react";
import { isAdminLoggedIn, clearAdminSession, createAdminSession } from "@/lib/adminAuth";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export interface AdminAuthState {
  accessToken: string | null;
  adminId: string | null;
  username: string | null;
  loading: boolean;
}

interface AdminAuthContextValue extends AdminAuthState {
  setAuth: (token: string, id: string, username: string) => void;
  clearAuth: () => void;
  adminFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const loggedIn = isAdminLoggedIn();
  const accessToken = loggedIn ? "session" : null;
  const adminId = loggedIn ? "admin" : null;
  const username = loggedIn ? "admin" : null;
  const loading = false;

  const setAuth = useCallback((_token: string, _id: string, _username: string) => {
    createAdminSession();
  }, []);

  const clearAuth = useCallback(() => {
    clearAdminSession();
  }, []);

  const adminFetch = useCallback(async (path: string, options: RequestInit = {}): Promise<Response> => {
    const cleanPath = path.startsWith(BASE_URL) ? path.slice(BASE_URL.length) : path;
    return fetch(`${BASE_URL}${cleanPath}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers ?? {}),
      },
    });
  }, []);

  return (
    <AdminAuthContext.Provider value={{ accessToken, adminId, username, loading, setAuth, clearAuth, adminFetch }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be inside AdminAuthProvider");
  return ctx;
}
