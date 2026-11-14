import { EyeOff, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import type { ReleaseLabelMode } from "@/features/tracking/timeline.ts";

export type ChatOnSwitchMode = "keep" | "divider" | "clear";

const PROTO_GROUPS = [
  {
    group: "Rastreio",
    items: [
      ["t:empty", "Vazio"],
      ["t:loading", "Carregando"],
      ["t:15", "#15"],
      ["t:375", "#375"],
      ["t:562", "#562"],
      ["t:1002", "#1002"],
      ["t:225", "#225 (1st)"],
      ["t:10453", "#10453 (OK)"],
      ["t:20322", "#20322 (Adiant.)"],
      ["t:notfound", "Não encontrado"],
      ["t:error", "Erro"],
    ],
  },
  {
    group: "Chat",
    items: [
      ["c:empty", "Vazio"],
      ["c:conversation", "Conversa"],
      ["c:typing", "Digitando"],
      ["c:error", "Erro"],
    ],
  },
  {
    group: "Ao trocar pedido",
    items: [
      ["s:keep", "Manter"],
      ["s:divider", "Divisor"],
      ["s:clear", "Zerar"],
    ],
  },
  {
    group: "Liberação (#562)",
    items: [
      ["r:waiting", "Aguard. liberação"],
      ["r:payment", "Pagto. não processado"],
    ],
  },
  {
    group: "Rede",
    items: [
      ["n:on", "On"],
      ["n:off", "Off"],
    ],
  },
] as const;

interface ProtoBarProps {
  activeKeys: readonly string[];
  onSelectPreset: (presetKey: string) => void;
  defaultHidden?: boolean;
}

export function ProtoBar({ activeKeys, onSelectPreset, defaultHidden = false }: ProtoBarProps) {
  const [hidden, setHidden] = useState(defaultHidden);

  if (hidden) {
    return (
      <button
        type="button"
        onClick={() => setHidden(false)}
        className="fixed bottom-3 left-3 z-50 flex items-center gap-1.5 px-3 h-7 rounded-full bg-slate-900/90 text-[11px] font-medium text-slate-300 shadow-lg hover:text-white transition"
      >
        <SlidersHorizontal className="w-3.5 h-3.5" />
        Controles do protótipo
      </button>
    );
  }

  return (
    <div className="shrink-0 bg-slate-900 text-[11px] text-slate-400 border-b border-slate-800">
      <div className="flex items-center gap-2.5 px-4 h-9 overflow-x-auto scroll-thin">
        <span className="flex items-center gap-1.5 font-mono font-semibold uppercase tracking-wider text-amber-400 shrink-0">
          <SlidersHorizontal className="w-3.5 h-3.5" />
          Direção D
        </span>

        <div className="flex items-center gap-2.5 shrink-0">
          {PROTO_GROUPS.map((g) => (
            <div key={g.group} className="flex items-center gap-2.5 shrink-0">
              <div className="h-4 w-px bg-slate-700 shrink-0" />
              <div className="flex items-center gap-0.5 shrink-0">
                <span className="mr-1 text-slate-500">{g.group}:</span>
                {g.items.map(([key, label]) => {
                  const isOn = activeKeys.includes(key);
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => onSelectPreset(key)}
                      className={`px-1.5 h-6 rounded font-medium transition ${
                        isOn
                          ? "bg-white/15 text-white"
                          : "text-slate-400 hover:text-white hover:bg-white/5"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <button
          type="button"
          onClick={() => setHidden(true)}
          className="ml-auto flex items-center gap-1 px-2 h-6 rounded text-slate-500 hover:text-white hover:bg-white/5 shrink-0"
        >
          <EyeOff className="w-3.5 h-3.5" />
          Ocultar
        </button>
      </div>
    </div>
  );
}

export type { ReleaseLabelMode };
