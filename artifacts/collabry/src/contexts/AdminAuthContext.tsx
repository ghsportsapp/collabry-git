import { createContext, useContext, useCallback, type ReactNode } from "react";
import { getAdminAuth, createAdminAuthSession, clearAdminSession, type AdminAuthData } from "@/lib/adminAuth";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";

export interface AdminAuthState {
  accessToken: string | null;
  adminId: string | null;
  username: string | null;
  name: string | null;
  isSuperAdmin: boolean;
  allowedSections: string[];
  loading: boolean;
}

interface AdminAuthContextValue extends AdminAuthState {
  setAuth: (data: AdminAuthData) => void;
  clearAuth: () => void;
  adminFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null);

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const auth = getAdminAuth();
  const accessToken = auth?.token ?? null;
  const adminId = auth?.adminId ?? null;
  const username = auth?.username ?? null;
  const name = auth?.name ?? null;
  const isSuperAdmin = auth?.isSuperAdmin ?? false;
  const allowedSections = auth?.allowedSections ?? [];
  const loading = false;

  const setAuth = useCallback((data: AdminAuthData) => {
    createAdminAuthSession(data);
  }, []);

  const clearAuth = useCallback(() => {
    clearAdminSession();
  }, []);

  const adminFetch = useCallback(async (path: string, options: RequestInit = {}): Promise<Response> => {
    const cleanPath = path.startsWith(BASE_URL) ? path.slice(BASE_URL.length) : path;
    // Read the token fresh so a login/logout mid-session is reflected without a reload.
    const token = getAdminAuth()?.token ?? null;
    return fetch(`${BASE_URL}${cleanPath}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  }, []);

  return (
    <AdminAuthContext.Provider value={{ accessToken, adminId, username, name, isSuperAdmin, allowedSections, loading, setAuth, clearAuth, adminFetch }}>
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be inside AdminAuthProvider");
  return ctx;
}
