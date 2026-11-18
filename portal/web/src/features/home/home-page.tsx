import { ASSISTANT_NAME, type ShippingMode } from "@translog/contracts";
import {
  ArrowRight,
  Headset,
  Lock,
  MessageSquareText,
  PackageSearch,
  ScanBarcode,
} from "lucide-react";
import { type FormEvent, useState } from "react";
import { SAMPLE_HINTS } from "@/api/fixtures.ts";
import { useOrderSamples, useOrdersSummary } from "@/api/queries.ts";
import { SUPPORT_HOURS } from "@/features/tracking/order-status.ts";
import { onlyDigits } from "@/lib/format.ts";
import { trackingHref } from "@/lib/router.ts";
import { Link, navigate } from "@/lib/use-location.tsx";
import { RouteMap } from "./route-map.tsx";

interface HomePageProps {
  /** Abre (ou foca) o painel do LogBot. */
  onOpenLogBot: () => void;
  /** Destino de "Acesso colaborador". */
  staffAccessHref: string;
}

const MODES: { mode: ShippingMode; deadline: string; description: string; accent: boolean }[] = [
  {
    mode: "Standard Class",
    deadline: "Despacho em até 4 dias",
    description: "Econômica, para envios sem urgência.",
    accent: false,
  },
  {
    mode: "Second Class",
    deadline: "Despacho em até 2 dias",
    description: "Equilíbrio entre prazo e custo.",
    accent: false,
  },
  {
    mode: "First Class",
    deadline: "Despacho em até 1 dia",
    description: "Prioridade na preparação e no embarque.",
    accent: true,
  },
  {
    mode: "Same Day",
    deadline: "Despacho no mesmo dia",
    description: "Expedição no mesmo dia da compra.",
    accent: true,
  },
];

const STEPS = [
  {
    title: "Digite o número do pedido",
    text: "Só os dígitos, como aparece na confirmação da compra.",
  },
  {
    title: "Veja onde está e o motivo provável",
    text: "Etapa atual, previsão de entrega e, se atrasou, o motivo provável.",
  },
  {
    title: `Pergunte ao ${ASSISTANT_NAME}`,
    text: "A qualquer hora. Atrasos de 3 dias ou mais e extravios seguem para a central.",
  },
];

/** Página inicial do cliente (`/`): herói com busca e mapa, números, como funciona, modalidades e central. */
export function HomePage({ onOpenLogBot, staffAccessHref }: HomePageProps) {
  const summary = useOrdersSummary().data;

  return (
    <div className="pb-10">
      {/* Herói */}
      <section className="pt-12 pb-10 grid grid-cols-[minmax(0,1.05fr)_minmax(0,1fr)] gap-8 items-center">
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

      {/* Faixa de números */}
      <section
        aria-label="A TransLog em números"
        className="grid grid-cols-4 rounded-lg border border-slate-200 bg-white/90 shadow-sm divide-x divide-slate-200"
      >
        <Stat value="5" label="mercados" />
        <Stat value="4" label="modalidades de envio" />
        <Stat value={`${ASSISTANT_NAME} 24h`} label="assistente a qualquer hora" />
        <Stat value="Seg–sex 9h–18h" label="central de atendimento" />
      </section>

      {/* Como funciona */}
      <section className="mt-12" aria-labelledby="como-funciona">
        <p className="label-mono !text-accent-700 font-semibold">Como funciona</p>
        <h2 id="como-funciona" className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
          Do número do pedido à resposta, sem ligar para a central
        </h2>
        <ol className="mt-5 grid grid-cols-3 gap-4">
          {STEPS.map((step, index) => (
            <li
              key={step.title}
              className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm flex gap-4"
            >
              <span
                className={`w-9 h-9 shrink-0 rounded-md grid place-items-center font-mono text-sm font-bold ${
                  index === 1 ? "bg-accent text-slate-900" : "bg-primary text-white"
                }`}
              >
                {String(index + 1).padStart(2, "0")}
              </span>
              <div>
                <h3 className="font-semibold text-slate-900">{step.title}</h3>
                <p className="mt-1 text-sm text-slate-600">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {/* Modalidades */}
      <section className="mt-12" aria-labelledby="modalidades">
        <p className="label-mono !text-accent-700 font-semibold">Serviços</p>
        <h2 id="modalidades" className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
          Quatro modalidades de envio
        </h2>
        <ul className="mt-5 grid grid-cols-4 gap-4">
          {MODES.map((item) => (
            <li
              key={item.mode}
              className={`rounded-lg border border-slate-200 border-t-[3px] bg-white p-4 shadow-sm ${
                item.accent ? "border-t-accent" : "border-t-primary"
              }`}
            >
              <p className="label-mono">{item.deadline}</p>
              <h3 className="mt-1 font-semibold text-slate-900">{item.mode}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.description}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Central de atendimento */}
      <section
        className="mt-12 rounded-lg border border-slate-200 border-l-4 border-l-accent bg-white px-6 py-5 shadow-sm flex items-center gap-5"
        aria-labelledby="central"
      >
        <span className="w-11 h-11 shrink-0 rounded-md bg-primary-50 text-primary grid place-items-center">
          <Headset aria-hidden="true" className="w-5 h-5" />
        </span>
        <div className="flex-1 min-w-0">
          <h2 id="central" className="text-lg font-semibold text-slate-900">
            Central de atendimento · {SUPPORT_HOURS}
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Atrasos de 3 dias ou mais e extravios são acompanhados pela central. O {ASSISTANT_NAME}{" "}
            responde a qualquer hora.
          </p>
        </div>
        <button
          type="button"
          onClick={onOpenLogBot}
          className="h-10 px-4 rounded-md bg-slate-900 text-sm font-semibold text-white shadow-sm hover:bg-primary inline-flex items-center gap-2 transition shrink-0"
        >
          <MessageSquareText aria-hidden="true" className="w-4 h-4" />
          Perguntar ao {ASSISTANT_NAME}
        </button>
      </section>

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

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div className="px-5 py-4">
      <p className="text-lg font-bold tracking-tight text-slate-900">{value}</p>
      <p className="label-mono mt-0.5">{label}</p>
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
