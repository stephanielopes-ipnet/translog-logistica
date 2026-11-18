import { PackageSearch, RefreshCw, RotateCcw, SearchX, WifiOff } from "lucide-react";

const CARD_CLS = "bg-surface border border-slate-300/90 rounded-lg shadow-sm";

export function TrackingEmptyState() {
  return (
    <div className={`${CARD_CLS} border-dashed py-12 px-8 text-center fade-in`}>
      <div className="mx-auto w-12 h-12 rounded-md bg-primary-50 border border-primary-100 text-primary grid place-items-center">
        <PackageSearch className="w-6 h-6" />
      </div>
      <p className="label-mono mt-4">Consulta de remessa internacional</p>
      <h2 className="mt-1 text-base font-semibold text-slate-900">Acompanhe seu pedido</h2>
      <p className="mt-1.5 text-sm text-slate-500 max-w-md mx-auto">
        Digite o número do pedido acima ou selecione um dos exemplos rápidos para ver a situação, o
        cumprimento do prazo, a rota e o motivo provável em caso de atraso.
      </p>

      <div className="mt-8 pt-6 border-t border-slate-200/80 grid grid-cols-3 gap-4 max-w-2xl mx-auto text-left">
        <div className="rounded-md border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5">
          <p className="label-mono !text-[var(--text-link)]">01 · Situação e prazo</p>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Previsão de entrega, dias de atraso ou adiantamento sem rodeios.
          </p>
        </div>
        <div className="rounded-md border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5">
          <p className="label-mono !text-amber-800">02 · Motivo provável</p>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Indicação transparente da causa provável quando houver atraso registrado.
          </p>
        </div>
        <div className="rounded-md border border-slate-200/80 bg-slate-50/70 px-3.5 py-2.5">
          <p className="label-mono !text-slate-700">03 · Rota e manifesto</p>
          <p className="mt-1 text-xs text-slate-600 leading-relaxed">
            Onde o volume está, cada etapa da viagem (coleta, voo, alfândega, entrega) e os itens.
          </p>
        </div>
      </div>
    </div>
  );
}

export function TrackingLoadingState() {
  return (
    <section className="space-y-4" aria-busy="true" aria-label="Carregando pedido">
      <div className={`${CARD_CLS} animate-pulse overflow-hidden`}>
        <div className="px-5 py-4 border-b border-slate-200 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="h-7 w-28 rounded bg-slate-200" />
            <div className="h-5 w-24 rounded bg-slate-200" />
            <div className="h-5 w-20 rounded bg-slate-200" />
          </div>
          <div className="h-4 w-36 rounded bg-slate-200" />
        </div>
        <div className="grid grid-cols-4 divide-x divide-slate-200 border-b border-slate-200">
          <div className="p-5 space-y-2">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="h-6 w-32 rounded bg-slate-200" />
          </div>
          <div className="p-5 space-y-2">
            <div className="h-3 w-24 rounded bg-slate-200" />
            <div className="h-6 w-28 rounded bg-slate-200" />
          </div>
          <div className="p-5 space-y-2">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-6 w-28 rounded bg-slate-200" />
          </div>
          <div className="p-5 space-y-2">
            <div className="h-3 w-20 rounded bg-slate-200" />
            <div className="h-6 w-24 rounded bg-slate-200" />
          </div>
        </div>
        <div className="p-5 space-y-4">
          <div className="h-16 rounded-md bg-slate-100" />
          <div className="h-28 rounded-md bg-slate-100" />
        </div>
      </div>
      <div className={`${CARD_CLS} p-5 animate-pulse space-y-3`}>
        <div className="h-4 w-28 mb-2 rounded bg-slate-200" />
        <div className="h-4 w-full rounded bg-slate-200" />
        <div className="h-4 w-full rounded bg-slate-200" />
      </div>
    </section>
  );
}

export function TrackingNotFoundState({
  query,
  onClearSearch,
}: {
  query: string;
  onClearSearch: () => void;
}) {
  return (
    <div className={`${CARD_CLS} py-12 px-8 text-center fade-in`}>
      <div className="mx-auto w-12 h-12 rounded-md bg-slate-100 border border-slate-200 text-slate-500 grid place-items-center">
        <SearchX className="w-6 h-6" />
      </div>
      <p className="label-mono mt-4">Remessa não localizada</p>
      <h2 className="mt-1 text-base font-semibold text-slate-900">Pedido não encontrado</h2>
      <p className="mt-1.5 text-sm text-slate-500">Confira o número informado e tente novamente.</p>
      {query && (
        <p className="mt-3 inline-flex items-center rounded border border-slate-200 bg-slate-50 px-2.5 py-1 font-mono text-xs text-slate-600 tabular">
          Código consultado: #{query}
        </p>
      )}
      <div>
        <button
          type="button"
          onClick={onClearSearch}
          className="mt-5 h-9 px-4 rounded-md border border-slate-300 bg-surface text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 inline-flex items-center gap-2 transition"
        >
          <RotateCcw className="w-4 h-4" />
          Tentar outro número
        </button>
      </div>
    </div>
  );
}

export function TrackingErrorState({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={`${CARD_CLS} py-14 px-8 text-center fade-in`}>
      <div className="mx-auto w-12 h-12 rounded-md bg-red-50 border border-red-200 text-red-600 grid place-items-center">
        <WifiOff className="w-6 h-6" />
      </div>
      <p className="label-mono !text-red-600 mt-4">Falha de comunicação</p>
      <h2 className="mt-1 text-base font-semibold text-slate-900">
        Não foi possível conectar ao sistema
      </h2>
      <p className="mt-1.5 text-sm text-slate-500">
        Verifique sua conexão e tente novamente em alguns instantes.
      </p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-5 h-9 px-4 rounded-md border border-slate-300 bg-surface text-sm font-medium text-slate-700 shadow-sm hover:bg-slate-50 inline-flex items-center gap-2 transition"
      >
        <RefreshCw className="w-4 h-4" />
        Tentar novamente
      </button>
    </div>
  );
}
