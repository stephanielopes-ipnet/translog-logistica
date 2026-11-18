import { ASSISTANT_NAME } from "@translog/contracts";
import { MessageSquareText } from "lucide-react";
import { type ReactNode, useEffect, useRef } from "react";

export const LOGBOT_PANEL_ID = "logbot-panel";
export const LOGBOT_INPUT_ID = "logbot-input";
const LOGBOT_TAB_ID = "logbot-tab";

interface LogBotDockProps {
  open: boolean;
  onOpen: () => void;
  /** O `ChatPanel`, com o botão de minimizar. */
  children: ReactNode;
}

/**
 * LogBot na lateral direita das páginas do cliente: ~400 px ao lado do conteúdo (não por cima),
 * na altura útil abaixo do cabeçalho. Minimizado, desliza para a direita (~250 ms, largura +
 * `transform`), deixa de ocupar espaço (o conteúdo fica centralizado na tela) e deixa uma aba
 * fina vertical, fixa na borda direita da tela, para reabrir. Sem animação com
 * `prefers-reduced-motion` (`motion-safe:`).
 */
export function LogBotDock({ open, onOpen, children }: LogBotDockProps) {
  // Foco acompanha a ação do usuário: campo ao reabrir, aba ao minimizar (não no primeiro desenho).
  const previousOpen = useRef(open);
  useEffect(() => {
    if (previousOpen.current === open) {
      return;
    }
    previousOpen.current = open;
    const target = document.getElementById(open ? LOGBOT_INPUT_ID : LOGBOT_TAB_ID);
    // Depois de o `inert` sair do elemento que vai receber o foco.
    requestAnimationFrame(() => target?.focus());
  }, [open]);

  return (
    <aside
      aria-label={`${ASSISTANT_NAME}: assistente`}
      className="relative shrink-0 self-start sticky top-[var(--header-h)] overflow-x-clip h-[calc(100dvh-var(--header-h))] min-h-[560px] motion-safe:transition-[width] motion-safe:duration-[250ms] ease-out"
      style={{ width: open ? 424 : 0 }}
    >
      <section
        id={LOGBOT_PANEL_ID}
        aria-label={`Conversa com o ${ASSISTANT_NAME}`}
        inert={!open}
        className={`absolute top-5 bottom-5 right-0 w-[400px] flex flex-col motion-safe:transition-[transform,opacity] motion-safe:duration-[250ms] ease-out ${
          open ? "translate-x-0 opacity-100" : "translate-x-[calc(100%+24px)] opacity-0"
        }`}
      >
        {children}
      </section>

      <button
        id={LOGBOT_TAB_ID}
        type="button"
        onClick={onOpen}
        inert={open}
        aria-expanded={false}
        aria-controls={LOGBOT_PANEL_ID}
        title={`Abrir a conversa com o ${ASSISTANT_NAME}`}
        className={`fixed z-20 top-[calc(var(--header-h)+20px)] right-0 w-11 py-4 rounded-l-lg border border-r-0 border-slate-300/90 bg-surface shadow-sm flex flex-col items-center gap-3 text-primary hover:bg-primary-50 motion-safe:transition-opacity motion-safe:duration-[250ms] ${
          open ? "opacity-0 pointer-events-none" : "opacity-100"
        }`}
      >
        <span className="relative w-7 h-7 rounded-md bg-primary text-white grid place-items-center">
          <MessageSquareText aria-hidden="true" className="w-3.5 h-3.5" />
          <span
            aria-hidden="true"
            className="absolute -bottom-0.5 -right-0.5 w-2 h-2 rounded-full ring-2 ring-surface bg-accent"
          />
        </span>
        <span className="text-xs font-semibold tracking-wide [writing-mode:vertical-rl] rotate-180">
          {ASSISTANT_NAME}
        </span>
      </button>
    </aside>
  );
}
