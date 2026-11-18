import {
  ArrowLeft,
  ListFilter,
  Lock,
  LogOut,
  Moon,
  RadioTower,
  Search,
  Sun,
  UserRound,
} from "lucide-react";
import type { ReactNode } from "react";
import { STAFF_HOME_PATH, STAFF_SEARCH_PATH } from "@/lib/router.ts";
import type { Theme } from "@/lib/theme.ts";
import { Link } from "@/lib/use-location.tsx";
import { BrandMark } from "./brand-mark.tsx";

/** Tema atual e troca (botão no canto direito, nos dois cabeçalhos). */
interface ThemeProps {
  theme: Theme;
  onToggleTheme: () => void;
}

type AppHeaderProps = ThemeProps &
  (
    | {
        kind: "public";
        /** Página atual é o rastreio (marca a navegação). */
        trackingActive: boolean;
        /** Destino de "Acesso colaborador" (login, ou a Torre com sessão). */
        staffAccessHref: string;
      }
    | {
        kind: "staff";
        /** Página atual é a Torre (as outras páginas da área também marcam o item). */
        /** Página atual da área: marca "Torre de controle" ou "Pedidos" (o pedido conta como Pedidos). */
        staffPage: "tower" | "search" | "order";
        email: string;
        onLogout: () => void;
        loggingOut: boolean;
      }
  );

/**
 * Cabeçalho. Público: marca (Início), "Rastreamento", "Atendimento 24h" e o link discreto
 * "Acesso colaborador". Área do colaborador: marca + "Área do colaborador", "Torre de controle", "Pedidos",
 * e-mail, "Sair" e "Voltar ao site".
 */
export function AppHeader(props: AppHeaderProps) {
  const staff = props.kind === "staff";

  return (
    <header className="shrink-0 sticky top-0 bg-surface border-b border-slate-200 z-30">
      <div className="mx-auto max-w-[1440px] px-6 h-16 flex items-center gap-8">
        <Link
          href={staff ? STAFF_HOME_PATH : "/"}
          aria-label={
            staff ? "TransLog: ir para a Torre de controle" : "TransLog: ir para o Início"
          }
          className="flex items-center gap-3.5 rounded-md shrink-0"
        >
          <BrandMark />
          <div className="leading-none">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold tracking-tight text-slate-900">TransLog</span>
              <span className="inline-block h-3.5 w-px bg-slate-300" />
              <span className="label-mono !text-[var(--text-link)] font-semibold">
                International Logistics
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">
              {staff ? "Área do colaborador" : "Rastreamento de pedidos"}
            </div>
          </div>
        </Link>

        <nav aria-label={staff ? "Área do colaborador" : "Seções do site"} className="flex h-16">
          {staff ? (
            <>
              <NavItem
                href={STAFF_HOME_PATH}
                active={props.staffPage === "tower"}
                current={props.staffPage === "tower"}
                icon={<RadioTower aria-hidden="true" className="w-[15px] h-[15px]" />}
              >
                Torre de controle
              </NavItem>
              <NavItem
                href={STAFF_SEARCH_PATH}
                active={props.staffPage !== "tower"}
                current={props.staffPage === "search"}
                icon={<ListFilter aria-hidden="true" className="w-[15px] h-[15px]" />}
              >
                Pedidos
              </NavItem>
            </>
          ) : (
            <NavItem
              href="/rastreio"
              active={props.trackingActive}
              current={props.trackingActive}
              icon={<Search aria-hidden="true" className="w-[15px] h-[15px]" />}
            >
              Rastreamento
            </NavItem>
          )}
        </nav>

        <div className="ml-auto flex items-center gap-5 text-xs">
          {props.kind === "staff" ? (
            <>
              <span className="inline-flex items-center gap-1.5 text-slate-600">
                <UserRound aria-hidden="true" className="w-3.5 h-3.5 text-slate-400" />
                <span className="sr-only">Conectado como </span>
                {props.email}
              </span>
              <button
                type="button"
                onClick={props.onLogout}
                disabled={props.loggingOut}
                className="h-8 px-2.5 rounded border border-slate-300 bg-surface font-medium text-slate-700 hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50 inline-flex items-center gap-1.5 transition"
              >
                <LogOut aria-hidden="true" className="w-3.5 h-3.5" />
                Sair
              </button>
              <Link
                href="/"
                className="inline-flex items-center gap-1.5 rounded text-slate-500 hover:text-slate-900 transition-colors"
              >
                <ArrowLeft aria-hidden="true" className="w-3.5 h-3.5" />
                Voltar ao site
              </Link>
              <ThemeToggle theme={props.theme} onToggle={props.onToggleTheme} />
            </>
          ) : (
            <>
              <span
                title="O LogBot responde a qualquer hora"
                className="inline-flex items-center gap-1.5 text-slate-500"
              >
                <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent" />
                Atendimento 24h
              </span>
              <StaffAccessLink href={props.staffAccessHref} />
              <ThemeToggle theme={props.theme} onToggle={props.onToggleTheme} />
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

/** Alterna entre o tema claro e o escuro. */
function ThemeToggle({ theme, onToggle }: { theme: Theme; onToggle: () => void }) {
  const dark = theme === "dark";
  const label = dark ? "Ativar tema claro" : "Ativar tema escuro";
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-label={label}
      title={label}
      className="w-8 h-8 rounded-md border border-slate-200 bg-surface text-slate-500 hover:text-slate-900 hover:bg-slate-50 grid place-items-center transition"
    >
      {dark ? (
        <Sun aria-hidden="true" className="w-4 h-4" />
      ) : (
        <Moon aria-hidden="true" className="w-4 h-4" />
      )}
    </button>
  );
}

/** Link discreto, mas visível, para a Área do colaborador (cabeçalho e rodapé). */
export function StaffAccessLink({ href }: { href: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-1.5 rounded text-xs text-slate-400 hover:text-slate-700 transition-colors"
    >
      <Lock aria-hidden="true" className="w-3 h-3" />
      Acesso colaborador
    </Link>
  );
}

function NavItem({
  href,
  active,
  current,
  icon,
  children,
}: {
  href: string;
  active: boolean;
  current: boolean;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <Link
      href={href}
      aria-current={current ? "page" : undefined}
      className={`flex items-center gap-2 px-3.5 -mb-px border-b-2 text-sm font-semibold transition-colors ${
        active
          ? "border-primary text-primary"
          : "border-transparent text-slate-500 hover:text-slate-900"
      }`}
    >
      {icon}
      {children}
    </Link>
  );
}
