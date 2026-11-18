import type { Market, OrdersSummaryResponse } from "@translog/contracts";
import { formatOrderCount, MARKET_LABEL } from "./markets.ts";

// Mapa de rotas do Início (animação do protótipo 01, nas cores do tema claro): a origem
// "EUA · Porto Rico" ligada aos 5 mercados por rotas tracejadas que fluem (azul → âmbar).
// A animação para com `prefers-reduced-motion` (CSS `.route-flow` em index.css).

const MAP_MARKETS: readonly Market[] = ["USCA", "LATAM", "Europe", "Pacific Asia", "Africa"];
const ORIGIN = { x: 92, y: 190 };
const TARGET_X = 352;
const ROWS = [50, 120, 190, 260, 330];

export function RouteMap({ summary }: { summary: OrdersSummaryResponse | undefined }) {
  const counts = new Map(summary?.markets.map((item) => [item.market, item.orders]));
  const description = MAP_MARKETS.map((market) => {
    const count = counts.get(market);
    return `${MARKET_LABEL[market]}${count === undefined ? "" : `: ${formatOrderCount(count)}`}`;
  }).join("; ");

  return (
    <svg
      viewBox="0 0 560 380"
      role="img"
      aria-label={`Rotas da TransLog: dos EUA e de Porto Rico para cinco mercados. ${description}.`}
      className="w-full h-auto block"
    >
      <defs>
        <linearGradient
          id="route-gradient"
          gradientUnits="userSpaceOnUse"
          x1={ORIGIN.x}
          y1="0"
          x2={TARGET_X}
          y2="0"
        >
          <stop offset="0" stopColor="#3b7bbf" />
          <stop offset="1" stopColor="#f59e0b" />
        </linearGradient>
      </defs>

      <g
        fill="none"
        stroke="url(#route-gradient)"
        strokeWidth="2.4"
        strokeLinecap="round"
        className="route-flow"
      >
        {ROWS.map((y) => (
          <path
            key={y}
            d={`M${ORIGIN.x} ${ORIGIN.y} C${ORIGIN.x + 120} ${ORIGIN.y} ${TARGET_X - 130} ${y} ${TARGET_X} ${y}`}
          />
        ))}
      </g>

      <circle cx={ORIGIN.x} cy={ORIGIN.y} r="12" fill="#f59e0b" />
      <circle
        cx={ORIGIN.x}
        cy={ORIGIN.y}
        r="24"
        fill="none"
        stroke="#f59e0b"
        strokeOpacity="0.35"
      />
      <circle
        cx={ORIGIN.x}
        cy={ORIGIN.y}
        r="37"
        fill="none"
        stroke="#f59e0b"
        strokeOpacity="0.15"
      />
      <text
        x={ORIGIN.x}
        y={ORIGIN.y + 60}
        textAnchor="middle"
        className="fill-slate-900 font-mono"
        fontSize="14"
        fontWeight="600"
      >
        EUA · Porto Rico
      </text>
      <text
        x={ORIGIN.x}
        y={ORIGIN.y + 78}
        textAnchor="middle"
        className="fill-slate-500 font-mono"
        fontSize="12"
      >
        origem dos despachos
      </text>

      {MAP_MARKETS.map((market, index) => {
        const y = ROWS[index] ?? 0;
        const count = counts.get(market);
        return (
          <g key={market}>
            <circle
              cx={TARGET_X + 8}
              cy={y}
              r="8"
              fill="var(--color-surface)"
              stroke="var(--color-primary)"
              strokeWidth="2.4"
            />
            <text
              x={TARGET_X + 26}
              y={y - 2}
              className="fill-slate-900 font-mono"
              fontSize="15"
              fontWeight="600"
            >
              {MARKET_LABEL[market]}
            </text>
            <text x={TARGET_X + 26} y={y + 16} className="fill-slate-500 font-mono" fontSize="12.5">
              {count === undefined ? "…" : formatOrderCount(count)}
            </text>
          </g>
        );
      })}
    </svg>
  );
}
