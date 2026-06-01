import { useEffect } from "react";
import { useLocation } from "wouter";
import { isAdminLoggedIn, updateAdminActivity, clearAdminSession } from "@/lib/adminAuth";

const ACTIVITY_EVENTS = ["mousedown", "keydown", "scroll", "touchstart", "click"];
const CHECK_INTERVAL_MS = 20_000;

interface Props {
  children: React.ReactNode;
}

export default function AdminProtectedRoute({ children }: Props) {
  const [, navigate] = useLocation();
  const loggedIn = isAdminLoggedIn();

  useEffect(() => {
    if (!loggedIn) {
      navigate("/admin-collabryangad/login");
      return;
    }

    const onActivity = () => updateAdminActivity();
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
  }, [loggedIn]);

  if (!loggedIn) return null;
  return <>{children}</>;
}
