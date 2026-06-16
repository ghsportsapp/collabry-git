import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from "react";

const BASE_URL = import.meta.env.BASE_URL?.replace(/\/$/, "") ?? "";
const LOCAL_ID_KEY = "collabry_creator_id";
const LOCAL_NAME_KEY = "collabry_creator_name";

interface RefreshResult {
  accessToken: string | null;
  userId?: string;
  userType?: string;
  /** True only for an explicit 401/403 (token invalid/expired/revoked).
   *  Network errors and 5xx leave this false so we don't nuke a valid
   *  session over a transient blip. */
  authFailed: boolean;
}

/**
 * Single-flight refresh. The refresh token rotates on every call (the server
 * revokes the old token and, if it ever sees a revoked token again, treats it
 * as theft and revokes ALL sessions). On a cold PWA reopen the in-memory
 * access token is gone, so the provider's mount effect AND every queued
 * `apiFetch` 401-retry would each POST /refresh at once, all carrying the same
 * cookie — the first rotates it away and the rest look like reuse, logging the
 * user out. Collapsing concurrent callers onto one in-flight promise means only
 * one request ever uses a given cookie, so reuse-detection never trips on us.
 */
let refreshInFlight: Promise<RefreshResult> | null = null;

function refreshCreatorSession(): Promise<RefreshResult> {
  if (!refreshInFlight) {
    refreshInFlight = fetch(`${BASE_URL}/api/auth/creator/refresh`, {
      method: "POST",
      credentials: "include",
    })
      .then(async (r): Promise<RefreshResult> => {
        if (r.ok) {
          const data = await r.json();
          return {
            accessToken: data.accessToken ?? null,
            userId: data.userId,
            userType: data.userType,
            authFailed: false,
          };
        }
        return { accessToken: null, authFailed: r.status === 401 || r.status === 403 };
      })
      .catch((): RefreshResult => ({ accessToken: null, authFailed: false }))
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

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
    refreshCreatorSession()
      .then((result) => {
        if (result.accessToken) setAccessToken(result.accessToken);
        if (result.userId && result.userType === "CREATOR") {
          setCreatorId(result.userId);
          if (!localStorage.getItem(LOCAL_ID_KEY)) {
            localStorage.setItem(LOCAL_ID_KEY, result.userId);
          }
        } else if (result.authFailed) {
          setCreatorId(null);
          setCreatorName(null);
          localStorage.removeItem(LOCAL_ID_KEY);
          localStorage.removeItem(LOCAL_NAME_KEY);
        }
      })
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
      const result = await refreshCreatorSession();
      if (result.accessToken) {
        token = result.accessToken;
        setAccessToken(token);
        res = await doFetch(token);
      } else if (result.authFailed && localStorage.getItem(LOCAL_ID_KEY)) {
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
