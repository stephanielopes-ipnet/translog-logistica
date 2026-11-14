import { ArrowRight, ScanBarcode } from "lucide-react";
import { type FormEvent, useState } from "react";
import { SAMPLE_HINTS } from "@/api/fixtures.ts";
import { onlyDigits } from "@/lib/format.ts";

interface OrderSearchFormProps {
  queryValue: string;
  onQueryChange: (value: string) => void;
  onSubmitOrder: (rawOrderId: string) => void;
  sampleOrderIds: readonly number[];
  activeOrderId: number | null;
  isLoading: boolean;
}

export function OrderSearchForm({
  queryValue,
  onQueryChange,
  onSubmitOrder,
  sampleOrderIds,
  activeOrderId,
  isLoading,
}: OrderSearchFormProps) {
  const [showEmptyHint, setShowEmptyHint] = useState(false);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const cleaned = onlyDigits(queryValue);
    if (!cleaned) {
      setShowEmptyHint(true);
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

  function handleSampleClick(id: number) {
    setShowEmptyHint(false);
    const str = String(id);
    onQueryChange(str);
    onSubmitOrder(str);
  }

  return (
    <div className="bg-white border border-slate-300/90 rounded-lg shadow-sm px-5 py-4">
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
              id="orderInput"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="Ex.: 375"
              value={queryValue}
              onChange={(e) => handleInputChange(e.target.value)}
              className="w-full h-10 rounded-md border border-slate-300 bg-slate-50/60 pl-10 pr-3 font-mono text-[15px] font-medium text-slate-900 tabular placeholder:font-sans placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
          </div>
        </div>
        <button
          type="submit"
          disabled={isLoading}
          className="h-10 px-5 rounded-md bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary-700 inline-flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          <span>Rastrear</span>
          <ArrowRight className="w-4 h-4" />
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
                    : "border-slate-300 bg-white text-slate-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary"
                }`}
              >
                <span>#{id}</span>
                {hint && (
                  <span
                    className={`font-sans text-[11px] ${
                      isActive ? "text-primary-100" : "text-slate-400"
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
