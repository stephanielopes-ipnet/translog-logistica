// Estado do painel do LogBot nas páginas do cliente (aberto ou minimizado). Aberto por padrão;
// a escolha vale entre Início e Rastreamento e fica salva no navegador. O `localStorage` pode
// não existir ou falhar (modo privado, bloqueio): aí o painel só não lembra a escolha.

export const LOGBOT_PANEL_STORAGE_KEY = "translog.logbot.aberto";

type ReadableStorage = Pick<Storage, "getItem">;
type WritableStorage = Pick<Storage, "setItem">;

/** Aberto, salvo como minimizado ("0") ou padrão (aberto). */
export function readPanelOpen(storage: ReadableStorage | null): boolean {
  try {
    return storage?.getItem(LOGBOT_PANEL_STORAGE_KEY) !== "0";
  } catch {
    return true;
  }
}

export function writePanelOpen(storage: WritableStorage | null, open: boolean): void {
  try {
    storage?.setItem(LOGBOT_PANEL_STORAGE_KEY, open ? "1" : "0");
  } catch {
    // Sem armazenamento: a escolha vale só até recarregar a página.
  }
}

/** `localStorage` do navegador, ou `null` se não existir ou for bloqueado. */
export function browserStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export interface LogBotPanelStore {
  isOpen(): boolean;
  setOpen(open: boolean): void;
  subscribe(listener: () => void): () => void;
}

/** Guarda o estado do painel e avisa quem desenha (usado com `useSyncExternalStore`). */
export function createLogBotPanelStore(storage: (ReadableStorage & WritableStorage) | null) {
  let open = readPanelOpen(storage);
  const listeners = new Set<() => void>();
  const store: LogBotPanelStore = {
    isOpen: () => open,
    setOpen(next) {
      if (next === open) {
        return;
      }
      open = next;
      writePanelOpen(storage, next);
      for (const listener of listeners) {
        listener();
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  return store;
}

/**
 * Pergunta ao LogBot a partir da página ("Perguntar ao assistente", sugestões, central):
 * reabre o painel, se estiver minimizado, e envia a pergunta.
 */
export function askLogBot(store: LogBotPanelStore, send: (text: string) => void, text: string) {
  store.setOpen(true);
  send(text);
}
