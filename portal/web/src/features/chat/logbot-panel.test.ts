import { describe, expect, it, vi } from "vitest";
import {
  askLogBot,
  createLogBotPanelStore,
  LOGBOT_PANEL_STORAGE_KEY,
  readPanelOpen,
  writePanelOpen,
} from "./logbot-panel.ts";

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

const failingStorage = {
  getItem: () => {
    throw new Error("bloqueado");
  },
  setItem: () => {
    throw new Error("bloqueado");
  },
};

describe("estado do painel do LogBot", () => {
  it("abre por padrão (sem escolha salva, sem armazenamento ou com armazenamento bloqueado)", () => {
    expect(readPanelOpen(memoryStorage())).toBe(true);
    expect(readPanelOpen(null)).toBe(true);
    expect(readPanelOpen(failingStorage)).toBe(true);
  });

  it("lembra a escolha salva no navegador", () => {
    const storage = memoryStorage();
    writePanelOpen(storage, false);
    expect(storage.data.get(LOGBOT_PANEL_STORAGE_KEY)).toBe("0");
    expect(readPanelOpen(storage)).toBe(false);
    writePanelOpen(storage, true);
    expect(readPanelOpen(storage)).toBe(true);
    expect(() => writePanelOpen(failingStorage, false)).not.toThrow();
  });

  it("o store salva a mudança e avisa quem desenha, só quando muda", () => {
    const storage = memoryStorage({ [LOGBOT_PANEL_STORAGE_KEY]: "0" });
    const store = createLogBotPanelStore(storage);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.isOpen()).toBe(false);
    store.setOpen(true);
    store.setOpen(true);

    expect(store.isOpen()).toBe(true);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(storage.data.get(LOGBOT_PANEL_STORAGE_KEY)).toBe("1");
  });

  it("perguntar a partir da página reabre o painel minimizado e envia a pergunta", () => {
    const store = createLogBotPanelStore(memoryStorage({ [LOGBOT_PANEL_STORAGE_KEY]: "0" }));
    const send = vi.fn();

    askLogBot(store, send, "Por que o pedido #76902 atrasou?");

    expect(store.isOpen()).toBe(true);
    expect(send).toHaveBeenCalledWith("Por que o pedido #76902 atrasou?");
  });
});
