import { ASSISTANT_NAME } from "@translog/contracts";
import { ArrowRight, Lock, PackageSearch, ScanBarcode } from "lucide-react";
import { type FormEvent, useState } from "react";
import { SAMPLE_HINTS } from "@/api/fixtures.ts";
import { useOrderSamples, useOrdersSummary } from "@/api/queries.ts";
import { onlyDigits } from "@/lib/format.ts";
import { trackingHref } from "@/lib/router.ts";
import { Link, navigate } from "@/lib/use-location.tsx";
import { DataBand, JourneySection, ModesSection, SupportSection } from "./home-sections.tsx";
import { RouteMap } from "./route-map.tsx";

interface HomePageProps {
  /** Abre (ou foca) o painel do LogBot. */
  onOpenLogBot: () => void;
  /** Destino de "Acesso colaborador". */
  staffAccessHref: string;
}

/** Página inicial do cliente (`/`): herói com busca e mapa, números, como funciona, modalidades e central. */
export function HomePage({ onOpenLogBot, staffAccessHref }: HomePageProps) {
  const summary = useOrdersSummary().data;

  return (
    <div className="pb-10">
      {/* Herói */}
      <section className="pt-12 pb-10 grid grid-cols-1 gap-8 items-center min-[1180px]:grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)]">
        <div className="min-w-0">
          <p className="label-mono !text-accent-700 !text-[11px] font-semibold">
            Logística internacional · EUA e Porto Rico
          </p>
          <h1 className="mt-3 text-[clamp(34px,3.1vw,48px)] leading-[1.05] font-extrabold tracking-tight text-slate-900">
            <span className="block whitespace-nowrap">Sua carga pelo mundo.</span>
            <span className="block whitespace-nowrap text-accent">Cada etapa visível.</span>
          </h1>
          <p className="mt-4 max-w-[520px] text-[16px] leading-relaxed text-slate-600">
            A TransLog leva pedidos dos Estados Unidos e de Porto Rico para cinco mercados. Você
            acompanha despacho, voo, alfândega e entrega, e conversa com o {ASSISTANT_NAME} a
            qualquer hora.
          </p>
          <HomeSearch />
        </div>
        <div className="min-w-0">
          <RouteMap summary={summary} />
        </div>
      </section>

      <DataBand summary={summary} />
      <JourneySection />
      <ModesSection />
      <SupportSection onOpenLogBot={onOpenLogBot} />

      {/* Linha final discreta */}
      <p className="mt-10 text-center text-sm text-slate-500">
        É da equipe TransLog?{" "}
        <Link
          href={staffAccessHref}
          className="inline-flex items-center gap-1 font-medium text-slate-600 underline-offset-4 hover:text-primary hover:underline rounded"
        >
          <Lock aria-hidden="true" className="w-3.5 h-3.5" />
          Acesso colaborador
        </Link>
      </p>
    </div>
  );
}

/** Busca do Início: mesma validação do rastreio (só dígitos), e vai para `/rastreio?pedido=N`. */
function HomeSearch() {
  const [value, setValue] = useState("");
  const [showEmptyHint, setShowEmptyHint] = useState(false);
  const sampleOrderIds = useOrderSamples().orderIds;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = onlyDigits(value);
    if (!cleaned) {
      setShowEmptyHint(true);
      return;
    }
    navigate(trackingHref(cleaned));
  }

  return (
    <div className="mt-7 max-w-[540px]">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="rounded-lg border border-slate-300/90 bg-white p-4 shadow-sm"
      >
        <label htmlFor="homeOrderInput" className="label-mono !text-accent-700 block mb-1.5">
          Número do pedido
        </label>
        <div className="flex gap-3">
          <div className="relative flex-1">
            <ScanBarcode
              aria-hidden="true"
              className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            />
            <input
              id="homeOrderInput"
              type="text"
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              placeholder="Ex.: 76902"
              value={value}
              aria-describedby={showEmptyHint ? "homeOrderHint" : undefined}
              onChange={(event) => {
                const cleaned = onlyDigits(event.target.value);
                if (cleaned) setShowEmptyHint(false);
                setValue(cleaned);
              }}
              className="w-full h-11 rounded-md border border-slate-300 bg-slate-50/60 pl-10 pr-3 font-mono text-[15px] font-medium text-slate-900 tabular placeholder:font-sans placeholder:text-slate-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary transition"
            />
          </div>
          <button
            type="submit"
            className="h-11 px-5 rounded-md bg-primary text-white text-sm font-semibold shadow-sm hover:bg-primary-700 inline-flex items-center gap-2 transition"
          >
            Rastrear
            <ArrowRight aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
        {showEmptyHint && (
          <p id="homeOrderHint" className="mt-2 text-xs text-red-600 font-medium">
            Informe o número do pedido para consultar.
          </p>
        )}
      </form>
      <div className="mt-3 flex items-center gap-2 flex-wrap">
        <span className="text-xs text-slate-500 inline-flex items-center gap-1">
          <PackageSearch aria-hidden="true" className="w-3.5 h-3.5" />
          Exemplos:
        </span>
        {sampleOrderIds.map((id) => (
          <Link
            key={id}
            href={trackingHref(id)}
            className="h-7 px-2.5 rounded-full border border-slate-300 bg-white font-mono text-xs text-slate-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary inline-flex items-center gap-1.5 transition"
          >
            <b className="font-semibold">#{id}</b>
            {SAMPLE_HINTS[id] && (
              <span className="font-sans text-[11px] text-slate-400">{SAMPLE_HINTS[id]}</span>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}
