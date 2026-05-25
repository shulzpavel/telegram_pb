import { afterEach, describe, expect, it } from "vitest";
import {
  THEME_STORAGE_KEY,
  applyThemeMode,
  isThemeMode,
  readStoredThemeMode,
  resolveTheme,
} from "./theme";

// Minimal in-memory stand-ins for the DOM/storage primitives the theme module
// touches. The bundled test runner does not ship with jsdom, so we drive the
// helpers through these fakes instead of relying on a real document.

function createFakeStorage(): Storage {
  const store = new Map<string, string>();
  const storage: Storage = {
    get length() {
      return store.size;
    },
    clear: () => store.clear(),
    getItem: (key: string) => (store.has(key) ? (store.get(key) as string) : null),
    setItem: (key: string, value: string) => {
      store.set(key, String(value));
    },
    removeItem: (key: string) => {
      store.delete(key);
    },
    key: (index: number) => Array.from(store.keys())[index] ?? null,
  };
  return storage;
}

function createFakeDocument() {
  const attributes = new Map<string, string>();
  const style: Record<string, string> = {};
  const documentElement = {
    style,
    setAttribute(name: string, value: string) {
      attributes.set(name, value);
    },
    getAttribute(name: string) {
      return attributes.has(name) ? (attributes.get(name) as string) : null;
    },
    hasAttribute(name: string) {
      return attributes.has(name);
    },
  };
  return { documentElement } as unknown as Document;
}

afterEach(() => {
  // Tests run in node, but be defensive in case anyone introduces a real DOM.
  if (typeof document !== "undefined") {
    document.documentElement.removeAttribute?.("data-theme");
  }
});

describe("theme helpers", () => {
  it("validates theme modes", () => {
    expect(isThemeMode("dark")).toBe(true);
    expect(isThemeMode("light")).toBe(true);
    expect(isThemeMode("system")).toBe(true);
    expect(isThemeMode("hot-pink")).toBe(false);
    expect(isThemeMode(undefined)).toBe(false);
  });

  it("resolves system mode against the user's preference", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
  });

  it("applies the resolved mode to <html> and persists the choice", () => {
    const doc = createFakeDocument();
    const storage = createFakeStorage();

    const resolved = applyThemeMode("dark", false, { doc, storage });

    expect(resolved).toBe("dark");
    expect(doc.documentElement.getAttribute("data-theme")).toBe("dark");
    expect((doc.documentElement as unknown as HTMLElement).style.colorScheme).toBe("dark");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("dark");
  });

  it("respects system preference when mode is 'system'", () => {
    const doc = createFakeDocument();
    const storage = createFakeStorage();

    applyThemeMode("system", true, { doc, storage });
    expect(doc.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("system");

    applyThemeMode("system", false, { doc, storage });
    expect(doc.documentElement.getAttribute("data-theme")).toBe("light");
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe("system");
  });

  it("reads only valid modes from storage", () => {
    const storage = createFakeStorage();

    expect(readStoredThemeMode(storage)).toBeNull();

    storage.setItem(THEME_STORAGE_KEY, "garbage");
    expect(readStoredThemeMode(storage)).toBeNull();

    storage.setItem(THEME_STORAGE_KEY, "light");
    expect(readStoredThemeMode(storage)).toBe("light");
  });
});
