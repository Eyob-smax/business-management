"use client";
/**
 * Light / dark / follow-the-system, remembered per device.
 *
 * The `.dark` class is applied by an inline script in the document head (see
 * ThemeScript) so there is no flash of the wrong theme on a cold PWA launch.
 */
import * as React from "react";

export type ThemeChoice = "light" | "dark" | "system";

const STORAGE_KEY = "bm-theme";

type Ctx = { theme: ThemeChoice; setTheme: (t: ThemeChoice) => void; resolved: "light" | "dark" };

const ThemeContext = React.createContext<Ctx | null>(null);

export function useTheme() {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside <ThemeProvider>");
  return ctx;
}

function systemPrefersDark() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<ThemeChoice>("system");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  React.useEffect(() => {
    const stored = (localStorage.getItem(STORAGE_KEY) as ThemeChoice | null) ?? "system";
    setThemeState(stored);
  }, []);

  React.useEffect(() => {
    const apply = () => {
      const dark = theme === "dark" || (theme === "system" && systemPrefersDark());
      document.documentElement.classList.toggle("dark", dark);
      setResolved(dark ? "dark" : "light");
      // Keep the Android status bar in step with the app surface.
      document
        .querySelector('meta[name="theme-color"]')
        ?.setAttribute("content", dark ? "#14120f" : "#d97706");
    };
    apply();

    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  const setTheme = React.useCallback((t: ThemeChoice) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
  }, []);

  const value = React.useMemo(() => ({ theme, setTheme, resolved }), [theme, setTheme, resolved]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Inline, blocking, tiny. Runs before first paint. */
export function ThemeScript() {
  const js = `(function(){try{var t=localStorage.getItem('${STORAGE_KEY}')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);if(d)document.documentElement.classList.add('dark');}catch(e){}})();`;
  return <script dangerouslySetInnerHTML={{ __html: js }} />;
}
