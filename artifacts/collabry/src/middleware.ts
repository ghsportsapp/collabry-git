import { useEffect, type ReactNode } from "react";
import { useLocation } from "wouter";
import { isAuthenticated, getCurrentUser, refreshAccessToken } from "./lib/session";
import { UserType } from "./types";

export type RouteAccess = "creator" | "brand" | "admin" | "public";

const PUBLIC_PATHS = ["/login", "/signup", "/creator/login", "/creator/signup", "/brand/login", "/brand/signup", "/admin/login"];

const CREATOR_BRAND_PATHS = ["/creator", "/brand"];
const BRAND_ONLY_PATHS = ["/brand"];
const ADMIN_PATHS = ["/admin"];

export function classifyRoute(pathname: string): RouteAccess {
  if (PUBLIC_PATHS.some((p) => pathname === p || pathname.startsWith(p + "/"))) {
    return "public";
  }
  if (pathname.startsWith("/api/auth")) return "public";
  if (ADMIN_PATHS.some((p) => pathname.startsWith(p))) return "admin";
  if (BRAND_ONLY_PATHS.some((p) => pathname.startsWith(p))) return "brand";
  if (CREATOR_BRAND_PATHS.some((p) => pathname.startsWith(p))) return "creator";
  return "public";
}

export interface AuthGuardProps {
  children: ReactNode;
  fallback?: ReactNode;
}

export function useAuthGuard(requiredAccess: RouteAccess): {
  allowed: boolean;
  loading: boolean;
} {
  const [location, navigate] = useLocation();

  useEffect(() => {
    if (requiredAccess === "public") return;

    if (!isAuthenticated()) {
      refreshAccessToken().then((token) => {
        if (!token) {
          const loginPath =
            requiredAccess === "admin"
              ? "/admin/login"
              : requiredAccess === "brand"
              ? "/brand/login"
              : "/creator/login";
          navigate(loginPath);
        }
      });
      return;
    }

    const user = getCurrentUser();
    if (!user) {
      navigate("/login");
      return;
    }

    if (requiredAccess === "admin" && user.userType !== UserType.ADMIN) {
      navigate("/admin/login");
      return;
    }

    if (requiredAccess === "brand" && user.userType !== UserType.BRAND) {
      navigate("/brand/login");
      return;
    }

    if (requiredAccess === "creator" && user.userType === UserType.ADMIN) {
      navigate("/admin");
      return;
    }
  }, [location, requiredAccess, navigate]);

  if (requiredAccess === "public") return { allowed: true, loading: false };

  const authenticated = isAuthenticated();
  const user = getCurrentUser();

  if (!authenticated || !user) return { allowed: false, loading: true };

  if (requiredAccess === "admin") {
    return { allowed: user.userType === UserType.ADMIN, loading: false };
  }

  if (requiredAccess === "brand") {
    return { allowed: user.userType === UserType.BRAND, loading: false };
  }

  if (requiredAccess === "creator") {
    return {
      allowed: user.userType === UserType.CREATOR || user.userType === UserType.BRAND,
      loading: false,
    };
  }

  return { allowed: true, loading: false };
}
