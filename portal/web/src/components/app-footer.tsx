import { StaffAccessLink } from "./app-header.tsx";

/**
 * Rodapé discreto: uma faixa baixa com o aviso de empresa fictícia, o link "Acesso colaborador"
 * (só nas páginas públicas) e "Desenvolvido por" com o logo da IPNET.
 */
export function AppFooter({ staffAccessHref }: { staffAccessHref: string | null }) {
  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white text-[12px] text-slate-400">
      <div className="mx-auto max-w-[1440px] px-6 h-11 flex items-center gap-6">
        <p className="truncate">
          <span className="font-medium text-slate-500">TransLog International Logistics</span>
          {" · "}Empresa fictícia criada para o Projeto Integrador IPNET Academy 2026 · Grupo 3
        </p>
        <div className="ml-auto flex items-center gap-6 shrink-0">
          {staffAccessHref && <StaffAccessLink href={staffAccessHref} />}
          <p className="flex items-center gap-2 whitespace-nowrap">
            Desenvolvido por
            <img
              src="/ipnet.svg"
              alt="IPNET"
              width={37}
              height={20}
              className="h-5 w-auto brightness-0 opacity-45"
            />
          </p>
        </div>
      </div>
    </footer>
  );
}
