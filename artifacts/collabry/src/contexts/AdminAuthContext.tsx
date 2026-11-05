import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
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
  // Lazy initializer reads the stored session synchronously on mount, so a
  // logged-in admin is rehydrated across a page refresh (until logout/timeout).
  const [auth, setAuthState] = useState<AdminAuthData | null>(() => getAdminAuth());

  // Re-read once after mount to pick up any session written just before this
  // provider mounted (and to drop an expired one).
  useEffect(() => { setAuthState(getAdminAuth()); }, []);

  const setAuth = useCallback((data: AdminAuthData) => {
    createAdminAuthSession(data); // persist for refresh
    setAuthState(data);           // update in-memory immediately (no refresh needed)
  }, []);

  const clearAuth = useCallback(() => {
    clearAdminSession();
    setAuthState(null);
  }, []);

  const adminFetch = useCallback(async (path: string, options: RequestInit = {}): Promise<Response> => {
    const cleanPath = path.startsWith(BASE_URL) ? path.slice(BASE_URL.length) : path;
    // Read the token fresh from storage so it's always current (and correct even
    // right after a rehydrate), then send it as a Bearer header.
    const token = getAdminAuth()?.token ?? auth?.token ?? null;
    return fetch(`${BASE_URL}${cleanPath}`, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers ?? {}),
      },
    });
  }, [auth]);

  return (
    <AdminAuthContext.Provider
      value={{
        accessToken: auth?.token ?? null,
        adminId: auth?.adminId ?? null,
        username: auth?.username ?? null,
        name: auth?.name ?? null,
        isSuperAdmin: auth?.isSuperAdmin ?? false,
        allowedSections: auth?.allowedSections ?? [],
        loading: false,
        setAuth,
        clearAuth,
        adminFetch,
      }}
    >
      {children}
    </AdminAuthContext.Provider>
  );
}

export function useAdminAuth() {
  const ctx = useContext(AdminAuthContext);
  if (!ctx) throw new Error("useAdminAuth must be inside AdminAuthProvider");
  return ctx;
}
