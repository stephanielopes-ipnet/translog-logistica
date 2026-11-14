interface AppHeaderProps {
  connected: boolean;
}

export function AppHeader({ connected }: AppHeaderProps) {
  return (
    <header className="shrink-0 bg-white border-b border-slate-200">
      <div className="mx-auto max-w-[1440px] px-6 h-16 flex items-center justify-between">
        <div className="flex items-center gap-3.5">
          {/* Marca: etiqueta de remessa + rota internacional com ponto âmbar */}
          <svg width="38" height="38" viewBox="0 0 38 38" aria-hidden="true" className="shrink-0">
            <rect width="38" height="38" rx="6" fill="#0F4C81" />
            <path
              d="M9 12h13l7 7-7 7H9V12z"
              fill="none"
              stroke="#ffffff"
              strokeWidth="2"
              strokeLinejoin="round"
            />
            <circle cx="14" cy="19" r="2" fill="#ffffff" />
            <path
              d="M16 19h6"
              stroke="#ffffff"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeDasharray="2 2"
            />
            <circle cx="29" cy="19" r="3" fill="#F59E0B" />
          </svg>
          <div className="leading-none">
            <div className="flex items-center gap-2">
              <span className="text-[17px] font-bold tracking-tight text-slate-900">TransLog</span>
              <span className="hidden sm:inline-block h-3.5 w-px bg-slate-300" />
              <span className="label-mono !text-primary font-semibold">
                International Logistics
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1">Rastreamento de pedidos</div>
          </div>
        </div>

        {connected ? (
          <div className="flex items-center gap-2 rounded border border-slate-200 bg-slate-50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-slate-600">
            <span className="w-2 h-2 rounded-full bg-emerald-500" />
            Conectado
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded border border-red-200 bg-red-50 px-3 py-1 font-mono text-[11px] uppercase tracking-wider text-red-700">
            <span className="w-2 h-2 rounded-full bg-red-500" />
            Sem conexão
          </div>
        )}
      </div>

      {/* Fita institucional discreta: âncora visual de manifesto internacional */}
      <div className="flex h-[3px]">
        <div className="w-20 bg-accent" />
        <div className="flex-1 bg-primary" />
      </div>
    </header>
  );
}
