// Tema claro ou escuro. A escolha fica no navegador; sem escolha, segue o sistema.
// O index.html aplica o tema antes de desenhar (mesma chave), para a tela não "piscar".

export type Theme = "light" | "dark";

export const THEME_STORAGE_KEY = "translog.tema";

type ThemeStorage = Pick<Storage, "getItem" | "setItem">;

/** Escolha salva ("light"/"dark") ou, sem escolha válida, a preferência do sistema. */
export function resolveTheme(stored: string | null, prefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") {
    return stored;
  }
  return prefersDark ? "dark" : "light";
}

export function nextTheme(theme: Theme): Theme {
  return theme === "dark" ? "light" : "dark";
}

function readStored(storage: ThemeStorage | null): string | null {
  try {
    return storage?.getItem(THEME_STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
}

/** Liga ou desliga a classe `dark` no `<html>` (as cores vêm de variáveis em index.css). */
export function applyTheme(root: HTMLElement, theme: Theme): void {
  root.classList.toggle("dark", theme === "dark");
  root.style.colorScheme = theme;
}

export interface ThemeStore {
  get(): Theme;
  set(theme: Theme): void;
  subscribe(listener: () => void): () => void;
}

/** Guarda o tema, salva a escolha e avisa quem desenha (usado com `useSyncExternalStore`). */
export function createThemeStore(
  storage: ThemeStorage | null,
  prefersDark: boolean,
  onChange: (theme: Theme) => void = () => {},
): ThemeStore {
  let theme = resolveTheme(readStored(storage), prefersDark);
  const listeners = new Set<() => void>();
  return {
    get: () => theme,
    set(next) {
      if (next === theme) {
        return;
      }
      theme = next;
      try {
        storage?.setItem(THEME_STORAGE_KEY, next);
      } catch {
        // Sem armazenamento: vale até recarregar a página.
      }
      onChange(next);
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Store do navegador: `localStorage` + `prefers-color-scheme`, aplicando no `<html>`. */
export function createBrowserThemeStore(): ThemeStore {
  let storage: Storage | null = null;
  let prefersDark = false;
  try {
    storage = window.localStorage;
  } catch {
    storage = null;
  }
  try {
    prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  } catch {
    prefersDark = false;
  }
  const store = createThemeStore(storage, prefersDark, (theme) =>
    applyTheme(document.documentElement, theme),
  );
  applyTheme(document.documentElement, store.get());
  return store;
}
