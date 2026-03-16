"use client";

import { useEffect, useState } from "react";

export default function ThemeToggle() {
  const [dark, setDark] = useState(true);

  useEffect(() => {
    const saved = localStorage.getItem("theme");
    if (saved === "light") {
      setDark(false);
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
    }
  }, []);

  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) {
      document.documentElement.classList.remove("light");
      document.documentElement.classList.add("dark");
      localStorage.setItem("theme", "dark");
    } else {
      document.documentElement.classList.remove("dark");
      document.documentElement.classList.add("light");
      localStorage.setItem("theme", "light");
    }
  };

  return (
    <button
      onClick={toggle}
      className="absolute top-3 left-3 z-10 w-8 h-8 flex items-center justify-center bg-[var(--bg-card)] border border-[var(--border)] text-[var(--text-dim)] hover:text-[var(--accent)] hover:border-[var(--accent)]/30 cursor-pointer transition-colors text-sm"
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <path d="M8 1a7 7 0 100 14A7 7 0 008 1zm0 12.5a5.5 5.5 0 01-1.64-10.75 6 6 0 007.39 7.39A5.49 5.49 0 018 13.5z" />
        </svg>
      ) : (
        <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5">
          <circle cx="8" cy="8" r="3" />
          <path d="M8 0v2M8 14v2M0 8h2M14 8h2M2.34 2.34l1.42 1.42M12.24 12.24l1.42 1.42M2.34 13.66l1.42-1.42M12.24 3.76l1.42-1.42" stroke="currentColor" strokeWidth="1.5" fill="none" />
        </svg>
      )}
    </button>
  );
}
