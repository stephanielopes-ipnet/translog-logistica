import { LogOut, RadioTower, Search, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import type { AreaTab } from "@/lib/router.ts";
import { Link } from "@/lib/use-location.tsx";
import { BrandMark } from "./brand-mark.tsx";

interface AppHeaderProps {
  tab: AreaTab;
  connected: boolean;
  /** Na Área do colaborador com sessão: e-mail e botão "Sair". */
  staff?: { email: string; onLogout: () => void; loggingOut: boolean } | null;
}

const TABS: { tab: Exclude<AreaTab, null>; href: string; label: string; icon: ReactNode }[] = [
  {
    tab: "tracking",
    href: "/rastreio",
    label: "Rastreamento",
    icon: <Search aria-hidden="true" className="w-[15px] h-[15px]" />,
  },
  {
    tab: "staff",
    href: "/colaborador",
    label: "Área do colaborador",
    icon: <RadioTower aria-hidden="true" className="w-[15px] h-[15px]" />,
  },
];

export function AppHeader({ tab, connected, staff }: AppHeaderProps) {
  const inStaffArea = tab === "staff";

  return (
    <header className="shrink-0 bg-white border-b border-slate-200 relative z-20">
      <div className="mx-auto max-w-[1440px] px-6 h-16 grid grid-cols-[1fr_auto_1fr] items-center">
        <Link
          href="/"
          aria-label="TransLog: ir para o Início"
          className="flex items-center gap-3.5 justify-self-start rounded-md"
        >
          <BrandMark />
          <div className="leading-none">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold tracking-tight text-slate-900">TransLog</span>
              <span className="inline-block h-3.5 w-px bg-slate-300" />
              <span className="label-mono !text-primary font-semibold">
                International Logistics
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {inStaffArea ? "Área do colaborador" : "Rastreamento de pedidos"}
            </div>
          </div>
        </Link>

        <nav aria-label="Áreas do portal" className="flex h-16 gap-1">
          {TABS.map((item) => {
            const active = item.tab === tab;
            return (
              <Link
                key={item.tab}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 px-3.5 -mb-px border-b-2 text-sm font-semibold transition-colors ${
                  active
                    ? "border-primary text-primary"
                    : "border-transparent text-slate-500 hover:text-slate-900"
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="justify-self-end flex items-center gap-4">
          {!inStaffArea && (
            <Indicator
              dotClass="bg-accent"
              title="O LogBot responde a qualquer hora"
              label="Atendimento 24h"
            />
          )}
          <ConnectionIndicator connected={connected} />
          {staff && (
            <>
              <span className="h-4 w-px bg-slate-200" aria-hidden="true" />
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-600">
                <UserRound aria-hidden="true" className="w-3.5 h-3.5 text-slate-400" />
                <span className="sr-only">Conectado como </span>
                {staff.email}
              </span>
              <button
                type="button"
                onClick={staff.onLogout}
                disabled={staff.loggingOut}
                className="h-8 px-2.5 rounded border border-slate-300 bg-white text-xs font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
              >
                <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
                Sair
              </button>
            </>
          )}
        </div>
      </div>

      {/* Fita institucional discreta: âncora visual de manifesto internacional */}
      <div className="flex h-[3px]">
        <div className="w-20 bg-accent" />
        <div className="flex-1 bg-primary" />
      </div>
    </header>
  );
}

/** Indicador discreto: ponto pequeno + texto curto (sem selo). */
function Indicator({ dotClass, title, label }: { dotClass: string; title: string; label: string }) {
  return (
    <span title={title} className="inline-flex items-center gap-1.5 text-xs text-slate-500">
      <span aria-hidden="true" className={`w-1.5 h-1.5 rounded-full ${dotClass}`} />
      {label}
    </span>
  );
}

function ConnectionIndicator({ connected }: { connected: boolean }) {
  return (
    <span role="status" className="contents">
      {connected ? (
        <Indicator
          dotClass="bg-emerald-500"
          title="Serviço de rastreamento operacional"
          label="Conectado"
        />
      ) : (
        <span
          title="Não foi possível alcançar o servidor de rastreamento"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-red-700"
        >
          <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-red-500" />
          Sem conexão
        </span>
      )}
    </span>
  );
}
