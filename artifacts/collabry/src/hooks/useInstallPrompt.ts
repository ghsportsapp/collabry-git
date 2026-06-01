import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export type InstallPlatform = "android" | "ios" | "desktop" | "unsupported";

export interface InstallPromptState {
  /** True when the browser has fired beforeinstallprompt and we can call promptInstall(). */
  canInstall: boolean;
  /** True when running inside an installed PWA already. */
  isInstalled: boolean;
  /** Detected platform — used to decide whether to show iOS instructions vs Android button. */
  platform: InstallPlatform;
  /** Triggers the native install prompt (Android/desktop only). Returns true if user accepted. */
  promptInstall: () => Promise<boolean>;
}

function detectPlatform(): InstallPlatform {
  if (typeof window === "undefined") return "unsupported";
  const ua = window.navigator.userAgent;
  const isIOS = /iPhone|iPad|iPod/.test(ua) && !("MSStream" in window);
  if (isIOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

function detectInstalled(): boolean {
  if (typeof window === "undefined") return false;
  // Chrome / Android
  if (window.matchMedia?.("(display-mode: standalone)").matches) return true;
  // iOS Safari sets navigator.standalone when launched from home screen
  const navAny = window.navigator as Navigator & { standalone?: boolean };
  return navAny.standalone === true;
}

export function useInstallPrompt(): InstallPromptState {
  const [deferredPrompt, setDeferredPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState<boolean>(detectInstalled);
  const platform = detectPlatform();

  useEffect(() => {
    const onBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const promptInstall = async (): Promise<boolean> => {
    if (!deferredPrompt) return false;
    await deferredPrompt.prompt();
    const result = await deferredPrompt.userChoice;
    setDeferredPrompt(null);
    return result.outcome === "accepted";
  };

  return {
    canInstall: deferredPrompt !== null,
    isInstalled,
    platform,
    promptInstall,
  };
}
