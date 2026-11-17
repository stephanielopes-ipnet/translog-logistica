import { BrandMark } from "./brand-mark.tsx";

/** Rodapé: empresa fictícia do Projeto Integrador + "Desenvolvido por" com o logo da IPNET. */
export function AppFooter() {
  return (
    <footer className="shrink-0 border-t border-slate-200 bg-white text-slate-500">
      <div className="mx-auto max-w-[1440px] px-6 py-5 flex items-center justify-between gap-8">
        <div className="flex items-center gap-3">
          <BrandMark size={30} />
          <div>
            <p className="text-[14.5px] font-semibold text-slate-900">
              TransLog International Logistics
            </p>
            <p className="text-[12.5px]">
              Empresa fictícia criada para o Projeto Integrador IPNET Academy 2026 · Grupo 3
            </p>
          </div>
        </div>
        <p className="flex items-center gap-2.5 text-[13px] whitespace-nowrap">
          Desenvolvido por
          <img
            src="/ipnet.svg"
            alt="IPNET"
            width={52}
            height={28}
            className="h-7 w-auto brightness-0 opacity-80"
          />
        </p>
      </div>
    </footer>
  );
}
