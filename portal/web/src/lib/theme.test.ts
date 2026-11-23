import { describe, expect, it, vi } from "vitest";
import { createThemeStore, nextTheme, resolveTheme, THEME_STORAGE_KEY } from "./theme.ts";

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
    data,
  };
}

describe("tema claro e escuro", () => {
  it("usa a escolha salva e, sem ela, a preferência do sistema", () => {
    expect(resolveTheme("dark", false)).toBe("dark");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("roxo", false)).toBe("light");
  });

  it("alterna entre claro e escuro", () => {
    expect(nextTheme("light")).toBe("dark");
    expect(nextTheme("dark")).toBe("light");
  });

  it("salva a escolha, aplica e avisa quem desenha", () => {
    const storage = memoryStorage();
    const applied: string[] = [];
    const store = createThemeStore(storage, false, (theme) => applied.push(theme));
    const listener = vi.fn();
    store.subscribe(listener);

    store.set("dark");
    store.set("dark");

    expect(store.get()).toBe("dark");
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(applied).toEqual(["dark"]);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("funciona com o armazenamento bloqueado", () => {
    const blocked = {
      getItem: () => {
        throw new Error("bloqueado");
      },
      setItem: () => {
        throw new Error("bloqueado");
      },
    };
    const store = createThemeStore(blocked, true);
    expect(store.get()).toBe("dark");
    expect(() => store.set("light")).not.toThrow();
    expect(store.get()).toBe("light");
  });
});
