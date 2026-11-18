import {
  ASSISTANT_NAME,
  type Market,
  type OrdersSummaryResponse,
  type ShippingMode,
} from "@translog/contracts";
import {
  Bot,
  ClipboardList,
  Globe2,
  Headset,
  Layers,
  type LucideIcon,
  MessageSquareText,
  PackageCheck,
  Plane,
  ShieldCheck,
  Truck,
  Warehouse,
  Zap,
} from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { SUPPORT_HOURS } from "@/features/tracking/order-status.ts";
import { formatRoundedTotal, formatShare, MARKET_LABEL, roundedOrderTotal } from "./markets.ts";
import { journeyOffset, marketShares } from "./motion.ts";
import { useCountUp, useCycle, useInView, usePrefersReducedMotion } from "./use-motion.ts";

// Seções do Início abaixo do herói, animadas ao aparecer na tela (paradas com
// `prefers-reduced-motion`): números da plataforma, jornada do pedido, modalidades e central.

/** Atraso de entrada em cascata (`.reveal` em index.css). */
const delay = (ms: number): CSSProperties => ({ transitionDelay: `${ms}ms` });

function SectionTitle({ eyebrow, title, id }: { eyebrow: string; title: string; id: string }) {
  return (
    <>
      <p className="label-mono !text-accent-700 font-semibold">{eyebrow}</p>
      <h2 id={id} className="mt-1.5 text-2xl font-bold tracking-tight text-slate-900">
        {title}
      </h2>
    </>
  );
}

/* ---------------- Números da plataforma ---------------- */

const MARKET_COLORS: Record<Market, string> = {
  USCA: "#93c5fd",
  LATAM: "#f59e0b",
  Europe: "#3b82f6",
  "Pacific Asia": "#fcd34d",
  Africa: "#cbd5e1",
};

/** Faixa azul com os números da TransLog (total arredondado) e a parte de cada mercado. */
export function DataBand({ summary }: { summary: OrdersSummaryResponse | undefined }) {
  const [ref, inView] = useInView<HTMLElement>(0.3);
  // Ordem de grandeza ("65.000+"), não o número exato de pedidos.
  const rounded = roundedOrderTotal(summary?.totalOrders ?? 0);
  const total = useCountUp(rounded.value, inView && summary !== undefined);
  const markets = useCountUp(5, inView, 900);
  const modes = useCountUp(4, inView, 900);
  const shares = summary ? marketShares(summary.markets) : [];

  return (
    <section
      ref={ref}
      aria-labelledby="em-numeros"
      className="relative overflow-hidden rounded-xl bg-gradient-to-br from-primary-900 via-primary-800 to-primary text-white shadow-lg"
    >
      <BandRoutes />
      <div className="absolute inset-0 band-grid" aria-hidden="true" />

      <div className="relative px-7 py-7">
        <h2 id="em-numeros" className="label-mono !text-accent-200 font-semibold">
          A TransLog em números
        </h2>
        <dl className="mt-4 grid grid-cols-2 gap-6 min-[1180px]:grid-cols-4">
          <BigNumber
            icon={PackageCheck}
            value={summary ? formatRoundedTotal(total, rounded.plus) : "…"}
            label="pedidos acompanhados no portal"
            inView={inView}
            order={0}
          />
          <BigNumber
            icon={Globe2}
            value={String(markets)}
            label="mercados atendidos a partir dos EUA e de Porto Rico"
            inView={inView}
            order={1}
          />
          <BigNumber
            icon={Layers}
            value={String(modes)}
            label="modalidades de envio, do econômico ao mesmo dia"
            inView={inView}
            order={2}
          />
          <BigNumber
            icon={Bot}
            value="24h"
            label={`com o ${ASSISTANT_NAME}, que responde a qualquer hora`}
            inView={inView}
            order={3}
          />
        </dl>

        <div className="mt-7">
          <div className="flex items-baseline justify-between gap-4">
            <h3 className="text-sm font-semibold">Para onde vão os pedidos</h3>
            <span className="font-mono text-[11px] text-white/65">por mercado de destino</span>
          </div>
          <div
            role="img"
            aria-label={shares
              .map((share) => `${MARKET_LABEL[share.market]}: ${formatShare(share.pct)}`)
              .join("; ")}
            className="mt-2.5 flex h-3.5 rounded-full bg-white/10 overflow-hidden"
          >
            {shares.map((share, index) => (
              <span
                key={share.market}
                className="h-full motion-safe:transition-[width] motion-safe:duration-[1100ms] ease-out first:rounded-l-full last:rounded-r-full"
                style={{
                  width: inView ? `${share.pct}%` : "0%",
                  backgroundColor: MARKET_COLORS[share.market],
                  transitionDelay: `${300 + index * 120}ms`,
                }}
              />
            ))}
          </div>
          <ul className="mt-3 grid grid-cols-2 gap-3 min-[1180px]:grid-cols-5">
            {shares.map((share, index) => (
              <li
                key={share.market}
                className="reveal text-xs"
                data-inview={inView}
                style={delay(500 + index * 100)}
              >
                <span className="flex items-center gap-1.5 font-semibold text-white">
                  <span
                    aria-hidden="true"
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: MARKET_COLORS[share.market] }}
                  />
                  {MARKET_LABEL[share.market]}
                </span>
                <span className="mt-0.5 block font-mono text-white/65">
                  {formatShare(share.pct)} dos pedidos
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}

/** Hub de origem e destinos do desenho de fundo da faixa (coordenadas do viewBox 960 × 290). */
const BAND_ORIGIN = { x: 36, y: 276 };
const BAND_ROUTES = [
  { to: { x: 640, y: 34 }, control: { x: 300, y: -40 }, dur: 6.5, begin: 0 },
  { to: { x: 880, y: 52 }, control: { x: 420, y: -10 }, dur: 7, begin: 1.4 },
  { to: { x: 930, y: 132 }, control: { x: 520, y: 40 }, dur: 6, begin: 2.6 },
  { to: { x: 850, y: 196 }, control: { x: 480, y: 130 }, dur: 5.5, begin: 0.8 },
  { to: { x: 920, y: 258 }, control: { x: 520, y: 250 }, dur: 6.8, begin: 3.2 },
];
/** Curvas de "latitude" e "meridiano" que sugerem um globo atrás das rotas. */
const BAND_GLOBE = [
  "M-40 280 Q480 80 1000 280",
  "M-40 340 Q480 140 1000 340",
  "M-40 220 Q480 20 1000 220",
  "M330 -20 Q260 145 330 310",
  "M640 -20 Q710 145 640 310",
];

/**
 * Desenho de fundo da faixa de números: arcos de rota aérea do hub (EUA · Porto Rico) aos cinco
 * destinos, sobre curvas de um globo, com tracejado que flui e "pacotes" percorrendo as rotas.
 * Discreto de propósito (opacidade baixa), para não competir com os números por cima.
 * Com movimento reduzido, fica o desenho parado (sem pacotes nem pulsos).
 */
function BandRoutes() {
  const reduced = usePrefersReducedMotion();
  const paths = BAND_ROUTES.map(
    (route) =>
      `M${BAND_ORIGIN.x} ${BAND_ORIGIN.y} Q${route.control.x} ${route.control.y} ${route.to.x} ${route.to.y}`,
  );
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 960 290"
      preserveAspectRatio="none"
      className="absolute inset-0 w-full h-full opacity-55"
    >
      <defs>
        <linearGradient
          id="band-route"
          gradientUnits="userSpaceOnUse"
          x1="36"
          y1="0"
          x2="930"
          y2="0"
        >
          <stop offset="0" stopColor="#93c5fd" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
        <radialGradient id="band-parcel">
          <stop offset="0" stopColor="#fde68a" stopOpacity="1" />
          <stop offset="1" stopColor="#f59e0b" stopOpacity="0" />
        </radialGradient>
      </defs>

      <g fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1">
        {BAND_GLOBE.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      {/* Rota base, discreta, e o tracejado que flui por cima */}
      <g fill="none" stroke="#ffffff" strokeOpacity="0.07" strokeWidth="1.2">
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>
      <g
        fill="none"
        stroke="url(#band-route)"
        strokeOpacity="0.32"
        strokeWidth="1.6"
        strokeLinecap="round"
        className="route-flow"
      >
        {paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </g>

      {/* Destinos */}
      {BAND_ROUTES.map((route, index) => (
        <g key={`${route.to.x}-${route.to.y}`}>
          <circle cx={route.to.x} cy={route.to.y} r="3.5" fill="#ffffff" fillOpacity="0.75" />
          {!reduced && (
            <circle
              cx={route.to.x}
              cy={route.to.y}
              r="4"
              fill="none"
              stroke="#ffffff"
              strokeOpacity="0.5"
            >
              <animate
                attributeName="r"
                values="4;14"
                dur="2.4s"
                begin={`${index * 0.5}s`}
                repeatCount="indefinite"
              />
              <animate
                attributeName="stroke-opacity"
                values="0.5;0"
                dur="2.4s"
                begin={`${index * 0.5}s`}
                repeatCount="indefinite"
              />
            </circle>
          )}
        </g>
      ))}

      {/* Hub de origem */}
      <circle cx={BAND_ORIGIN.x} cy={BAND_ORIGIN.y} r="22" fill="#f59e0b" fillOpacity="0.08" />
      <circle cx={BAND_ORIGIN.x} cy={BAND_ORIGIN.y} r="12" fill="#f59e0b" fillOpacity="0.18" />
      <circle cx={BAND_ORIGIN.x} cy={BAND_ORIGIN.y} r="5" fill="#f59e0b" />

      {/* Pacotes percorrendo as rotas */}
      {!reduced &&
        BAND_ROUTES.map((route, index) => (
          <g key={`pacote-${route.to.x}`}>
            <circle r="9" fill="url(#band-parcel)" opacity="0.5">
              <animateMotion
                dur={`${route.dur}s`}
                begin={`${route.begin}s`}
                repeatCount="indefinite"
                path={paths[index]}
              />
            </circle>
            <circle r="2.6" fill="#fde68a">
              <animateMotion
                dur={`${route.dur}s`}
                begin={`${route.begin}s`}
                repeatCount="indefinite"
                path={paths[index]}
              />
            </circle>
          </g>
        ))}
    </svg>
  );
}

function BigNumber({
  icon: Icon,
  value,
  label,
  inView,
  order,
}: {
  icon: LucideIcon;
  value: string;
  label: string;
  inView: boolean;
  order: number;
}) {
  return (
    <div className="reveal" data-inview={inView} style={delay(order * 110)}>
      <dt className="sr-only">{label}</dt>
      <dd>
        <span className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-md bg-white/10 text-accent grid place-items-center">
            <Icon aria-hidden="true" className="w-4 h-4" />
          </span>
          <span className="text-[34px] leading-none font-extrabold tracking-tight tabular">
            {value}
          </span>
        </span>
        <span aria-hidden="true" className="mt-2 block text-[13px] leading-snug text-white/85">
          {label}
        </span>
      </dd>
    </div>
  );
}

/* ---------------- Jornada do pedido ---------------- */

const JOURNEY: { label: string; detail: string; icon: LucideIcon }[] = [
  { label: "Pedido", detail: "Pedido registrado no sistema", icon: ClipboardList },
  { label: "Coleta", detail: "Saiu da expedição nos EUA ou em Porto Rico", icon: PackageCheck },
  { label: "Voo", detail: "Em voo para o país de destino", icon: Plane },
  { label: "Alfândega", detail: "Liberação na alfândega do destino", icon: ShieldCheck },
  { label: "Transferência", detail: "No centro de distribuição local", icon: Warehouse },
  { label: "Última milha", detail: "Saiu para entrega ao destinatário", icon: Truck },
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

/** Trilha animada com as 6 etapas da viagem e os 3 passos para acompanhar o pedido. */
export function JourneySection() {
  const [ref, inView] = useInView<HTMLElement>(0.3);
  const last = JOURNEY.length - 1;
  // Cada etapa fica ~3,2 s parada; o pacote leva 1,8 s para chegar à próxima.
  const step = useCycle(last, inView, 3200);
  const offset = journeyOffset(step, JOURNEY.length);
  const current = JOURNEY[step] ?? JOURNEY[0];
  const CurrentIcon = current?.icon ?? Truck;

  return (
    <section ref={ref} className="mt-12" aria-labelledby="jornada">
      <SectionTitle
        id="jornada"
        eyebrow="Como funciona"
        title="Cada etapa da viagem, do pedido à sua porta"
      />

      <div className="mt-5 rounded-xl border border-slate-200 bg-surface px-8 pt-8 pb-6 shadow-sm">
        <div className="relative">
          {/* Trilha do centro do primeiro nó ao centro do último: base, progresso e pacote */}
          <div className="absolute left-7 right-7 min-[1180px]:left-12 min-[1180px]:right-12 top-[19px] h-1">
            <div className="absolute inset-0 rounded-full bg-slate-100" />
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-primary to-accent motion-safe:transition-[width] motion-safe:duration-[1800ms] ease-in-out"
              style={{ width: `${offset}%` }}
            />
            <div
              aria-hidden="true"
              className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 motion-safe:transition-[left] motion-safe:duration-[1800ms] ease-in-out z-10"
              style={{ left: `${offset}%` }}
            >
              <span className="relative grid place-items-center w-[50px] h-[50px] rounded-full bg-accent text-slate-900 shadow-lg ring-4 ring-surface">
                <span className="absolute inset-0 rounded-full bg-accent/40 motion-safe:animate-ping" />
                <CurrentIcon className="relative w-5 h-5" />
              </span>
            </div>
          </div>

          <ol className="relative flex justify-between">
            {JOURNEY.map((stage, index) => {
              const done = index <= step;
              const Icon = stage.icon;
              return (
                <li
                  key={stage.label}
                  className="w-14 min-[1180px]:w-24 flex flex-col items-center text-center"
                >
                  <span
                    style={{ transitionDelay: done ? "1500ms" : "0ms" }}
                    className={`w-10 h-10 rounded-full grid place-items-center border-2 motion-safe:transition-colors motion-safe:duration-500 ${
                      done
                        ? "bg-primary border-primary text-white"
                        : "bg-surface border-slate-200 text-slate-400"
                    }`}
                  >
                    <Icon aria-hidden="true" className="w-4 h-4" />
                  </span>
                  <span
                    className={`mt-3 text-[11px] min-[1180px]:text-sm font-semibold leading-tight ${done ? "text-slate-900" : "text-slate-400"}`}
                  >
                    {stage.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>

        <p
          aria-live="off"
          className="mt-6 mx-auto w-fit max-w-full flex-wrap justify-center rounded-full border border-slate-200 bg-slate-50 px-4 py-1.5 text-sm text-slate-700 flex items-center gap-2"
        >
          <span className="w-2 h-2 rounded-full bg-accent motion-safe:animate-pulse" />
          <span className="label-mono !text-slate-500">Agora</span>
          <strong className="font-semibold text-slate-900">{current?.label}</strong>
          <span className="text-slate-400">·</span>
          <span key={step} className="fade-in">
            {current?.detail}
          </span>
        </p>
      </div>

      <ol className="mt-4 grid grid-cols-1 gap-4 min-[1180px]:grid-cols-3">
        {STEPS.map((item, index) => (
          <li
            key={item.title}
            className="reveal rounded-lg border border-slate-200 bg-surface p-5 shadow-sm flex gap-4 hover:-translate-y-0.5 hover:shadow-md motion-safe:transition"
            data-inview={inView}
            style={delay(200 + index * 140)}
          >
            <span
              className={`w-9 h-9 shrink-0 rounded-md grid place-items-center font-mono text-sm font-bold ${
                index === 1 ? "bg-accent text-slate-900" : "bg-primary text-white"
              }`}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div>
              <h3 className="font-semibold text-slate-900">{item.title}</h3>
              <p className="mt-1 text-sm text-slate-600">{item.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ---------------- Modalidades ---------------- */

const MODES: { mode: ShippingMode; days: number; description: string; fast: boolean }[] = [
  {
    mode: "Standard Class",
    days: 4,
    description: "Econômica, para envios sem urgência.",
    fast: false,
  },
  { mode: "Second Class", days: 2, description: "Equilíbrio entre prazo e custo.", fast: false },
  {
    mode: "First Class",
    days: 1,
    description: "Prioridade na preparação e no embarque.",
    fast: true,
  },
  { mode: "Same Day", days: 0, description: "Expedição no mesmo dia da compra.", fast: true },
];

/** Um bloco por dia de prazo de despacho (até 4). */
const METER_BLOCKS = ["dia-1", "dia-2", "dia-3", "dia-4"] as const;

/** As 4 modalidades, com um medidor do prazo de despacho que se preenche ao aparecer. */
export function ModesSection() {
  const [ref, inView] = useInView<HTMLElement>(0.3);
  return (
    <section ref={ref} className="mt-12" aria-labelledby="modalidades">
      <SectionTitle id="modalidades" eyebrow="Serviços" title="Quatro modalidades de envio" />
      <ul className="mt-5 grid grid-cols-2 gap-4 min-[1180px]:grid-cols-4">
        {MODES.map((item, index) => (
          <li
            key={item.mode}
            className="reveal group relative overflow-hidden rounded-xl border border-slate-200 bg-surface p-5 shadow-sm hover:-translate-y-1 hover:shadow-md motion-safe:transition"
            data-inview={inView}
            style={delay(index * 120)}
          >
            <span
              aria-hidden="true"
              className={`absolute inset-x-0 top-0 h-[3px] ${item.fast ? "bg-accent" : "bg-primary"}`}
            />
            <div className="flex items-center justify-between">
              <h3 className="font-semibold text-slate-900">{item.mode}</h3>
              {item.fast && (
                <Zap
                  aria-hidden="true"
                  className="w-4 h-4 text-accent group-hover:scale-125 motion-safe:transition"
                />
              )}
            </div>
            <p className="mt-3 flex items-baseline gap-1.5">
              <span className="text-[30px] leading-none font-extrabold tracking-tight text-slate-900">
                {item.days === 0 ? "Hoje" : item.days}
              </span>
              <span className="text-sm text-slate-500">
                {item.days === 0
                  ? "no mesmo dia"
                  : item.days === 1
                    ? "dia para despachar"
                    : "dias para despachar"}
              </span>
            </p>
            {/* Medidor: um bloco por dia de prazo (até 4); no mesmo dia, um brilho que corre */}
            <div className="mt-3 flex gap-1" aria-hidden="true">
              {item.days === 0 ? (
                <span className="h-1.5 flex-1 rounded-full bg-accent-100 overflow-hidden">
                  <span className="block h-full w-1/3 rounded-full bg-accent same-day-sweep" />
                </span>
              ) : (
                METER_BLOCKS.map((blockKey, block) => (
                  <span
                    key={blockKey}
                    className="h-1.5 flex-1 rounded-full bg-slate-100 overflow-hidden"
                  >
                    <span
                      className={`block h-full rounded-full motion-safe:transition-[width] motion-safe:duration-500 ${
                        item.fast ? "bg-accent" : "bg-primary"
                      }`}
                      style={{
                        width: inView && block < item.days ? "100%" : "0%",
                        transitionDelay: `${400 + index * 120 + block * 120}ms`,
                      }}
                    />
                  </span>
                ))
              )}
            </div>
            <p className="mt-3 text-sm text-slate-600">{item.description}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

/* ---------------- Central + prévia do LogBot ---------------- */

const PREVIEW_QUESTION = "Por que meu pedido atrasou?";
const PREVIEW_ANSWER =
  "O motivo provável é que o prazo de despacho desta modalidade costuma ser curto demais. " +
  "Como a entrega já está 5 dias atrasada, a central acompanha o seu caso.";

/** Central de atendimento (horário e regra) e uma prévia animada de conversa com o LogBot. */
export function SupportSection({ onOpenLogBot }: { onOpenLogBot: () => void }) {
  const [ref, inView] = useInView<HTMLElement>(0.3);
  // 0 vazio · 1 pergunta · 2 digitando · 3 resposta (segura e recomeça)
  const phase = useCycle(3, inView, 1300, 4);

  return (
    <section
      ref={ref}
      className="mt-12 grid grid-cols-1 gap-4 min-[1180px]:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]"
      aria-labelledby="central"
    >
      <div
        className="reveal rounded-xl border border-slate-200 border-l-4 border-l-accent bg-surface px-6 py-6 shadow-sm flex flex-col"
        data-inview={inView}
      >
        <span className="w-11 h-11 rounded-md bg-primary-50 text-primary grid place-items-center">
          <Headset aria-hidden="true" className="w-5 h-5" />
        </span>
        <p className="mt-4 label-mono !text-accent-700 font-semibold">Central de atendimento</p>
        <h2 id="central" className="mt-1 text-xl font-bold tracking-tight text-slate-900">
          Gente de verdade quando o seu caso precisa
        </h2>
        <p className="mt-2 text-sm text-slate-600">
          A central funciona de <strong className="text-slate-900">{SUPPORT_HOURS}</strong> e
          acompanha automaticamente:
        </p>
        <ul className="mt-3 flex flex-wrap gap-2">
          <RuleChip>Atraso de 3 dias ou mais</RuleChip>
          <RuleChip>Volume extraviado</RuleChip>
        </ul>
        <p className="mt-3 text-sm text-slate-600">
          Fora do horário, o {ASSISTANT_NAME} responde e explica o que está acontecendo.
        </p>
        <button
          type="button"
          onClick={onOpenLogBot}
          className="mt-5 self-start h-10 px-4 rounded-md bg-ink text-sm font-semibold text-ink-fg shadow-sm hover:bg-primary hover:text-white inline-flex items-center gap-2 transition"
        >
          <MessageSquareText aria-hidden="true" className="w-4 h-4" />
          Perguntar ao {ASSISTANT_NAME}
        </button>
      </div>

      <figure
        className="reveal rounded-xl border border-slate-200 bg-surface shadow-sm overflow-hidden flex flex-col"
        data-inview={inView}
        style={delay(150)}
      >
        <figcaption className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex items-center gap-2.5">
          <span className="relative w-8 h-8 rounded-md bg-primary text-white grid place-items-center">
            <MessageSquareText aria-hidden="true" className="w-4 h-4" />
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full ring-2 ring-surface bg-accent" />
          </span>
          <span className="text-sm font-semibold text-slate-900">{ASSISTANT_NAME}</span>
          <span className="ml-auto label-mono">Exemplo de conversa</span>
        </figcaption>
        <p className="sr-only">
          Exemplo: o cliente pergunta "{PREVIEW_QUESTION}" e o {ASSISTANT_NAME} responde:{" "}
          {PREVIEW_ANSWER}
        </p>
        <div aria-hidden="true" className="flex-1 min-h-[200px] px-4 py-4 space-y-3 bg-surface">
          {phase >= 1 && (
            <div className="flex justify-end fade-in">
              <span className="max-w-[80%] rounded-lg rounded-br-sm bg-primary px-3 py-2 text-sm text-white">
                {PREVIEW_QUESTION}
              </span>
            </div>
          )}
          {phase === 2 && (
            <div className="fade-in">
              <span className="inline-flex rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5">
                <span className="typing">
                  <span />
                  <span />
                  <span />
                </span>
              </span>
            </div>
          )}
          {phase >= 3 && (
            <div className="fade-in">
              <span className="block max-w-[88%] rounded-lg rounded-bl-sm border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-800">
                {PREVIEW_ANSWER}
              </span>
            </div>
          )}
        </div>
      </figure>
    </section>
  );
}

function RuleChip({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-900">
      <span aria-hidden="true" className="w-1.5 h-1.5 rounded-full bg-accent" />
      {children}
    </li>
  );
}
