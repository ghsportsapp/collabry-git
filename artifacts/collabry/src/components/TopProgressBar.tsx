import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";

const PINK = "#E14F69";

let active = 0;
const subs = new Set<() => void>();
const notify = () => subs.forEach((fn) => fn());

export default function TopProgressBar() {
  const [count, setCount] = useState(0);
  const [progress, setProgress] = useState(0);
  const [visible, setVisible] = useState(false);
  const [location] = useLocation();
  const fadeRef = useRef<number | null>(null);
  const tickRef = useRef<number | null>(null);

  useEffect(() => {
    const fn = () => setCount(active);
    subs.add(fn);
    return () => { subs.delete(fn); };
  }, []);

  // Show bar only on route navigation
  useEffect(() => {
    let ended = false;
    const end = () => {
      if (ended) return;
      ended = true;
      active = Math.max(0, active - 1);
      notify();
    };
    active++;
    notify();
    const t = window.setTimeout(end, 350);
    return () => {
      window.clearTimeout(t);
      end();
    };
  }, [location]);

  useEffect(() => {
    if (count > 0) {
      if (fadeRef.current !== null) {
        window.clearTimeout(fadeRef.current);
        fadeRef.current = null;
      }
      setVisible(true);
      setProgress((p) => (p < 10 ? 10 : p));
      if (tickRef.current !== null) window.clearInterval(tickRef.current);
      tickRef.current = window.setInterval(() => {
        setProgress((p) => (p < 90 ? p + (90 - p) * 0.1 : p));
      }, 180);
    } else {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      setProgress(100);
      fadeRef.current = window.setTimeout(() => {
        setVisible(false);
        setProgress(0);
      }, 280);
    }
    return () => {
      if (tickRef.current !== null) {
        window.clearInterval(tickRef.current);
        tickRef.current = null;
      }
      if (fadeRef.current !== null) {
        window.clearTimeout(fadeRef.current);
        fadeRef.current = null;
      }
    };
  }, [count]);

  if (!visible && progress === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        right: 0,
        height: 3,
        zIndex: 10000,
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          height: "100%",
          width: `${progress}%`,
          background: `linear-gradient(90deg, ${PINK}, #ff6eb4)`,
          boxShadow: "0 0 10px rgba(240,24,122,0.75), 0 0 4px rgba(240,24,122,0.55)",
          transition: "width 0.2s ease-out, opacity 0.28s ease-out",
          opacity: visible ? 1 : 0,
          willChange: "width, opacity",
        }}
      />
    </div>
  );
}
