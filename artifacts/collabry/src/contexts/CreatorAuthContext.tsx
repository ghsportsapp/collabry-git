import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const LOCAL_ID_KEY = "collabry_creator_id";
const LOCAL_NAME_KEY = "collabry_creator_name";

export interface CreatorAuthState {
  accessToken: string | null;
  creatorId: string | null;
  creatorName: string | null;
  loading: boolean;
}

interface CreatorAuthContextValue extends CreatorAuthState {
  setAuth: (token: string, id: string, name: string) => void;
  clearAuth: () => void;
  apiFetch: (path: string, options?: RequestInit) => Promise<Response>;
}

const CreatorAuthContext = createContext<CreatorAuthContextValue | null>(null);

export function CreatorAuthProvider({ children }: { children: ReactNode }) {
  const [accessToken, setAccessToken] = useState<string | null>(null);
  const [creatorId, setCreatorId] = useState<string | null>(null);
  const [creatorName, setCreatorName] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const storedId = localStorage.getItem(LOCAL_ID_KEY);
    const storedName = localStorage.getItem(LOCAL_NAME_KEY);
    if (storedId) {
      setCreatorId(storedId);
      setCreatorName(storedName);
    }
    fetch(`${BASE_URL}/api/auth/creator/refresh`, { method: "POST", credentials: "include" })
      .then(async (r) => {
        if (r.ok) {
          const data = await r.json();
          if (data.accessToken) setAccessToken(data.accessToken);
          if (data.userId && data.userType === "CREATOR") {
            setCreatorId(data.userId);
            if (!localStorage.getItem(LOCAL_ID_KEY)) {
              localStorage.setItem(LOCAL_ID_KEY, data.userId);
            }
          }
        } else if (r.status === 401 || r.status === 403) {
          setCreatorId(null);
          setCreatorName(null);
          localStorage.removeItem(LOCAL_ID_KEY);
          localStorage.removeItem(LOCAL_NAME_KEY);
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const setAuth = useCallback((token: string, id: string, name: string) => {
    setAccessToken(token);
    setCreatorId(id);
    setCreatorName(name);
    localStorage.setItem(LOCAL_ID_KEY, id);
    localStorage.setItem(LOCAL_NAME_KEY, name);
  }, []);

  const clearAuth = useCallback(() => {
    setAccessToken(null);
    setCreatorId(null);
    setCreatorName(null);
    localStorage.removeItem(LOCAL_ID_KEY);
    localStorage.removeItem(LOCAL_NAME_KEY);
  }, []);

  const apiFetch = useCallback(async (path: string, options: RequestInit = {}): Promise<Response> => {
    let token = accessToken;
    const doFetch = (t: string | null) =>
      fetch(`${BASE_URL}${path}`, {
        ...options,
        credentials: "include",
        headers: { "Content-Type": "application/json", ...(t ? { Authorization: `Bearer ${t}` } : {}), ...(options.headers ?? {}) },
      });
    let res = await doFetch(token);
    if (res.status === 401) {
      let refreshed = false;
      let refreshAuthFailed = false;
      try {
        const rr = await fetch(`${BASE_URL}/api/auth/creator/refresh`, { method: "POST", credentials: "include" });
        if (rr.ok) {
          const data = await rr.json();
          token = data.accessToken;
          if (token) { refreshed = true; setAccessToken(token); res = await doFetch(token); }
        } else if (rr.status === 401 || rr.status === 403) {
          refreshAuthFailed = true;
        }
      } catch { }
      if (!refreshed && refreshAuthFailed && localStorage.getItem(LOCAL_ID_KEY)) {
        setAccessToken(null);
        setCreatorId(null);
        setCreatorName(null);
        localStorage.removeItem(LOCAL_ID_KEY);
        localStorage.removeItem(LOCAL_NAME_KEY);
      }
    }
    return res;
  }, [accessToken]);

  return (
    <CreatorAuthContext.Provider value={{ accessToken, creatorId, creatorName, loading, setAuth, clearAuth, apiFetch }}>
      {children}
    </CreatorAuthContext.Provider>
  );
}

export function useCreatorAuth() {
  const ctx = useContext(CreatorAuthContext);
  if (!ctx) throw new Error("useCreatorAuth must be used inside CreatorAuthProvider");
  return ctx;
}
