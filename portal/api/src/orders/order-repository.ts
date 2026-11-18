import type { StaffSearchQuery, StaffSearchResponse } from "@translog/contracts";
import type { OrderRecord } from "./order-record.ts";
import { createOrderSearch } from "./order-search.ts";
import { computeOrderStats, type OrderStats } from "./order-stats.ts";
import type { PromiseScenario } from "./promise-scenario.ts";

/**
 * Porta: origem dos pedidos. Os adapters (`fixtures`, `file`, `databricks`) carregam tudo ao
 * subir e entregam registros já validados (`OrderRecord`), com os números agregados calculados
 * uma vez na carga e o cenário "Promessa ajustada" da Gold lido da mesma fonte. A escolha
 * acontece no `container.ts`.
 */
export interface OrderRepository {
  /** Registro do pedido pelo número, ou `null` se não existir. */
  findById(orderId: number): Promise<OrderRecord | null>;
  /** Quantos pedidos a fonte tem. */
  count(): Promise<number>;
  /** Busca do colaborador: filtra, ordena e pagina (índice montado na criação do repositório). */
  search(query: StaffSearchQuery): StaffSearchResponse;
  /** Números agregados dos pedidos carregados (calculados na carga, não a cada consulta). */
  stats(): OrderStats;
  /** Prazo de despacho sugerido por modalidade (Promessa ajustada, da Gold), da mesma fonte. */
  scenario(): PromiseScenario;
  /** Para tarefas em segundo plano ao encerrar a API (a conferência periódica do `databricks`). */
  close?(): void;
}

/** Repositório sobre pedidos já carregados em memória (base dos três adapters). */
export function createInMemoryRepository(
  byId: ReadonlyMap<number, OrderRecord>,
  scenario: PromiseScenario,
): OrderRepository {
  const stats = computeOrderStats(byId.values());
  return {
    async findById(orderId) {
      return byId.get(orderId) ?? null;
    },
    async count() {
      return byId.size;
    },
    search: createOrderSearch(byId.values()),
    stats: () => stats,
    scenario: () => scenario,
  };
}
