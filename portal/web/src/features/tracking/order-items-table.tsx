import type { OrderItem } from "@translog/contracts";
import { Boxes } from "lucide-react";
import { formatCurrency, pluralize } from "@/lib/format.ts";

interface OrderItemsTableProps {
  items: readonly OrderItem[];
  total: number;
}

export function OrderItemsTable({ items, total }: OrderItemsTableProps) {
  const keyedItems: Array<{ key: string; item: OrderItem }> = [];
  const counts = new Map<string, number>();
  for (const item of items) {
    const base = `${item.productName}:${item.category}:${item.quantity}:${item.total}`;
    const n = (counts.get(base) ?? 0) + 1;
    counts.set(base, n);
    keyedItems.push({ key: `${base}#${n}`, item });
  }

  return (
    <section className="bg-white border border-slate-300/90 rounded-lg shadow-sm overflow-hidden fade-in">
      <div className="px-5 py-3 border-b border-slate-200 flex items-center justify-between bg-slate-50/50">
        <div className="flex items-center gap-2">
          <Boxes className="w-4 h-4 text-slate-500" />
          <h3 className="label-mono !text-slate-700 font-semibold">Itens da remessa</h3>
        </div>
        <span className="font-mono text-xs text-slate-500">
          {pluralize(items.length, "item registrado", "itens registrados")}
        </span>
      </div>

      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-slate-200 bg-white">
            <th className="px-5 py-2 text-left label-mono">Produto</th>
            <th className="px-3 py-2 text-left label-mono">Categoria</th>
            <th className="px-3 py-2 text-right label-mono">Qtd.</th>
            <th className="px-5 py-2 text-right label-mono">Valor</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {keyedItems.map(({ key, item }) => (
            <tr key={key} className="hover:bg-slate-50/70">
              <td className="px-5 py-2.5 font-medium text-slate-900">{item.productName}</td>
              <td className="px-3 py-2.5">
                <span className="inline-flex rounded border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] text-slate-600 whitespace-nowrap">
                  {item.category}
                </span>
              </td>
              <td className="px-3 py-2.5 text-right font-mono tabular text-slate-700">
                {item.quantity}
              </td>
              <td className="px-5 py-2.5 text-right font-mono font-medium tabular text-slate-900 whitespace-nowrap">
                {formatCurrency(item.total)}
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="perf-t bg-slate-50/70">
            <td colSpan={3} className="px-5 py-3 text-right label-mono !text-slate-600">
              Total do pedido
            </td>
            <td className="px-5 py-3 text-right font-mono text-base font-bold text-slate-900 tabular whitespace-nowrap">
              {formatCurrency(total)}
            </td>
          </tr>
        </tfoot>
      </table>
    </section>
  );
}
