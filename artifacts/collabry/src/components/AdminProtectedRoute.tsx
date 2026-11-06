import { useEffect, useRef } from "react";
import { useLocation } from "wouter";
import { isAdminLoggedIn, updateAdminActivity, clearAdminSession } from "@/lib/adminAuth";

// Any of these resets the idle timer. mousemove is included so simply using the
// panel (not just clicking) keeps the session alive; adminFetch also resets it
// (see AdminAuthContext), so API polling counts as activity too.
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
const CHECK_INTERVAL_MS = 20_000;
// mousemove/scroll fire rapidly — only persist activity at most this often.
const ACTIVITY_THROTTLE_MS = 5_000;

interface Props {
  children: React.ReactNode;
}

export default function AdminProtectedRoute({ children }: Props) {
  const [location, navigate] = useLocation();
  const loggedIn = isAdminLoggedIn();
  const lastWrite = useRef(0);

  useEffect(() => {
    if (!loggedIn) {
      navigate("/admin-collabryangad/login");
      return;
    }

    // Count arriving on / navigating between admin routes as activity.
    updateAdminActivity();
    lastWrite.current = Date.now();

    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite.current < ACTIVITY_THROTTLE_MS) return;
      lastWrite.current = now;
      updateAdminActivity();
    };
    ACTIVITY_EVENTS.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));

    const timer = setInterval(() => {
      if (!isAdminLoggedIn()) {
        clearAdminSession();
        navigate("/admin-collabryangad/login");
      }
    }, CHECK_INTERVAL_MS);

    return () => {
      ACTIVITY_EVENTS.forEach((e) => window.removeEventListener(e, onActivity));
      clearInterval(timer);
    };
    // `location` so navigation re-runs this and stamps activity.
  }, [loggedIn, location, navigate]);

  if (!loggedIn) return null;
  return <>{children}</>;
}
