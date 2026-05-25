import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

export type ThemeMode = "dark" | "light" | "system";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "pp_theme";

const THEME_MODES: ThemeMode[] = ["dark", "light", "system"];

export function isThemeMode(value: unknown): value is ThemeMode {
  return typeof value === "string" && THEME_MODES.includes(value as ThemeMode);
}

export function resolveTheme(mode: ThemeMode, prefersDark: boolean): ResolvedTheme {
  if (mode === "system") return prefersDark ? "dark" : "light";
  return mode;
}

interface ApplyOptions {
  doc?: Document;
  storage?: Storage | null;
}

function safeStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

/**
 * Persists the chosen mode in localStorage and writes the resolved theme onto
 * <html data-theme>. Exposed so callers (and tests) can drive theme changes
 * without going through React state.
 */
export function applyThemeMode(
  mode: ThemeMode,
  prefersDark: boolean,
  options: ApplyOptions = {},
): ResolvedTheme {
  const doc = options.doc ?? (typeof document === "undefined" ? null : document);
  const storage = options.storage === undefined ? safeStorage() : options.storage;
  const resolved = resolveTheme(mode, prefersDark);
  if (doc) {
    doc.documentElement.setAttribute("data-theme", resolved);
    doc.documentElement.style.colorScheme = resolved;
  }
  if (storage) {
    try {
      storage.setItem(THEME_STORAGE_KEY, mode);
    } catch {
      /* private mode / quota — best effort only */
    }
  }
  return resolved;
}

export function readStoredThemeMode(storage: Storage | null = safeStorage()): ThemeMode | null {
  if (!storage) return null;
  try {
    const value = storage.getItem(THEME_STORAGE_KEY);
    return isThemeMode(value) ? value : null;
  } catch {
    return null;
  }
}

function currentPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return true; // default to dark so SSR/no-DOM contexts mirror the html default
  }
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function currentDocumentTheme(): ResolvedTheme | null {
  if (typeof document === "undefined") return null;
  const attr = document.documentElement.getAttribute("data-theme");
  return attr === "dark" || attr === "light" ? attr : null;
}

export interface ThemeContextValue {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (next: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: ReactNode;
  defaultMode?: ThemeMode;
  /**
   * Optional persistence hook invoked AFTER local state is updated. Used by
   * CMS to mirror the choice to the server. Failures are swallowed so the
   * local preference always sticks.
   */
  onPersist?: (mode: ThemeMode) => void | Promise<void>;
}

export function ThemeProvider({ children, defaultMode = "dark", onPersist }: ThemeProviderProps) {
  // Seed from storage; if nothing is stored, derive from whatever the inline
  // bootstrap script wrote onto <html> so we never disagree with the rendered
  // pixels.
  const [mode, setModeState] = useState<ThemeMode>(() => {
    const stored = readStoredThemeMode();
    if (stored) return stored;
    return defaultMode;
  });

  const [prefersDark, setPrefersDark] = useState<boolean>(() => currentPrefersDark());
  const [resolved, setResolved] = useState<ResolvedTheme>(() => {
    const documentTheme = currentDocumentTheme();
    if (documentTheme && mode === "system") return documentTheme;
    return resolveTheme(mode, prefersDark);
  });

  const onPersistRef = useRef(onPersist);
  useEffect(() => {
    onPersistRef.current = onPersist;
  }, [onPersist]);

  // Listen for system preference changes when in "system" mode.
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const update = (event: MediaQueryListEvent | MediaQueryList) => {
      setPrefersDark(event.matches);
    };
    update(mql);
    const listener = (event: MediaQueryListEvent) => update(event);
    if (typeof mql.addEventListener === "function") {
      mql.addEventListener("change", listener);
      return () => mql.removeEventListener("change", listener);
    }
    // Safari < 14 fallback
    mql.addListener(listener);
    return () => mql.removeListener(listener);
  }, []);

  // Apply theme to <html> whenever mode or system preference changes.
  useEffect(() => {
    const next = applyThemeMode(mode, prefersDark);
    setResolved(next);
  }, [mode, prefersDark]);

  const setMode = useCallback((next: ThemeMode) => {
    if (!isThemeMode(next)) return;
    setModeState((current) => {
      if (current === next) return current;
      // Fire-and-forget persistence; errors are swallowed by the consumer.
      const persist = onPersistRef.current;
      if (persist) {
        try {
          Promise.resolve(persist(next)).catch(() => undefined);
        } catch {
          /* ignored */
        }
      }
      return next;
    });
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ mode, resolved, setMode }),
    [mode, resolved, setMode],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
