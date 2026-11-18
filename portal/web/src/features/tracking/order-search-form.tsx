import { ArrowRight, Loader2, ScanBarcode, X } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { SAMPLE_HINTS } from "@/api/fixtures.ts";
import { onlyDigits } from "@/lib/format.ts";

interface OrderSearchFormProps {
  queryValue: string;
  onQueryChange: (value: string) => void;
  onSubmitOrder: (rawOrderId: string) => void;
  onClearOrder: () => void;
  sampleOrderIds: readonly number[];
  activeOrderId: number | null;
  isLoading: boolean;
}

export function OrderSearchForm({
  queryValue,
  onQueryChange,
  onSubmitOrder,
  onClearOrder,
  sampleOrderIds,
  activeOrderId,
  isLoading,
}: OrderSearchFormProps) {
  const [showEmptyHint, setShowEmptyHint] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) {
        return;
      }
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      inputRef.current?.focus();
      inputRef.current?.select();
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleaned = onlyDigits(queryValue);
    if (!cleaned) {
      setShowEmptyHint(true);
      inputRef.current?.focus();
      return;
    }
    setShowEmptyHint(false);
    onSubmitOrder(cleaned);
  }

  function handleInputChange(raw: string) {
    const cleaned = onlyDigits(raw);
    if (cleaned) {
      setShowEmptyHint(false);
    }
    onQueryChange(cleaned);
  }

  function handleClear() {
    setShowEmptyHint(false);
    onClearOrder();
    inputRef.current?.focus();
  }

  function handleSampleClick(id: number) {
    setShowEmptyHint(false);
    const str = String(id);
    onQueryChange(str);
    onSubmitOrder(str);
  }

  return (
    <div className="bg-surface border border-slate-300/90 rounded-lg shadow-sm px-5 py-4">
      <form onSubmit={handleSubmit} className="flex items-end gap-3" noValidate>
        <div className="flex-1">
          <label htmlFor="orderInput" className="label-mono block mb-1.5">
            Número do pedido
          </label>
          <div className="relative">
            <ScanBarcode
              aria-hidden="true"
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              ref={inputRef}
              id="orderInput"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="Ex.: 76902"
              value={queryValue}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full h-10 rounded-md border border-slate-300 bg-slate-50/60 pl-10 pr-10 font-mono text-[15px] font-medium text-slate-900 tabular placeholder:font-sans placeholder:text-slate-400 focus:bg-surface focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
            {queryValue ? (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Limpar número do pedido"
                title="Limpar busca"
                className="absolute right-2.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 grid place-items-center transition"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            ) : (
              <kbd
                title="Pressione / para buscar"
                className="absolute right-3 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded border border-slate-200 bg-surface font-mono text-[10px] text-slate-400 pointer-events-none select-none"
              >
                /
              </kbd>
            )}
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="h-10 px-5 rounded-md bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary-700 inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          <span>{isLoading ? "Consultando" : "Rastrear"}</span>
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <ArrowRight className="w-4 h-4" />
          )}
        </button>
      </form>

      {showEmptyHint && (
        <p className="mt-2 text-xs text-red-600 font-medium">
          Informe o número do pedido para consultar.
        </p>
      )}

      <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center gap-2 flex-wrap">
        <span className="label-mono mr-1">Exemplos rápidos:</span>
        <div className="flex items-center gap-1.5 flex-wrap">
          {sampleOrderIds.map((id) => {
            const isActive = id === activeOrderId;
            const hint = SAMPLE_HINTS[id];
            return (
              <button
                key={id}
                type="button"
                onClick={() => handleSampleClick(id)}
                className={`h-7 px-2.5 rounded border font-mono text-xs tabular inline-flex items-center gap-1.5 transition ${
                  isActive
                    ? "border-primary bg-primary text-white font-semibold shadow-sm"
                    : "border-slate-300 bg-surface text-slate-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary"
                }`}
              >
                <span>#{id}</span>
                {hint && (
                  <span
                    className={`font-sans text-[11px] ${
                      isActive ? "text-white/75" : "text-slate-400"
                    }`}
                  >
                    {hint}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
