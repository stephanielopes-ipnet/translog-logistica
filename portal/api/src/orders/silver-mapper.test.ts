import type { Order } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  FORBIDDEN_COLUMNS,
  mapSilverOrder,
  SILVER_COLUMNS,
  type SilverRow,
} from "./silver-mapper.ts";

/** Primeiro item do pedido 375, como na Silver (só as colunas lidas). */
const row375: SilverRow = {
  id_pedido: "375",
  data_pedido: "2015-01-06T11:01:00.000Z",
  data_envio: "2015-01-12T11:01:00.000Z",
  data_prevista_entrega: "2015-01-08T11:01:00.000Z",
  modo_envio: "Second Class",
  situacao_rastreio: "Em Trânsito",
  status_entrega_pt: "Atrasado",
  dias_atraso: "4",
  janela_atraso: "4. Atraso Crítico (3+ dias)",
  origem_cliente_cidade: "San Benito",
  origem_cliente_estado: "Texas",
  origem_cliente_pais: "Estados Unidos",
  destino_cidade: "Saltillo",
  destino_estado: "Coahuila",
  destino_pais: "México",
  destino_regiao: "América Central",
  mercado_logistico: "LATAM",
  nome_produto: "adidas Youth Germany Black/Red Away Match Soc",
  categoria_produto: "Girls' Apparel",
  quantidade_item: "1",
  valor_item_pedido: "68.6",
};

const secondItem375: SilverRow = {
  ...row375,
  nome_produto: "Under Armour Men's Tech II T-Shirt",
  categoria_produto: "Lacrosse",
  valor_item_pedido: "22.74",
};

function mapOrder(...rows: [SilverRow, ...SilverRow[]]): Order {
  const result = mapSilverOrder(rows);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  return result.data;
}

/** Caminhos dos campos que falharam na validação. */
function failedFields(...rows: [SilverRow, ...SilverRow[]]): string[] {
  const result = mapSilverOrder(rows);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("mapSilverOrder", () => {
  it("monta o pedido 375 como no protótipo, sem motivo provável (a coluna não existe na Silver)", () => {
    expect(mapOrder(row375, secondItem375)).toStrictEqual({
      orderId: 375,
      orderDate: "2015-01-06",
      shippingMode: "Second Class",
      trackingStatus: "Em Trânsito",
      deadlineStatus: "Atrasado",
      delayDays: 4,
      delayWindow: "Atraso Crítico (3+ dias)",
      estimatedDeliveryDate: "2015-01-08",
      actualDeliveryDate: null,
      origin: "San Benito, Texas, Estados Unidos",
      destination: "Saltillo, Coahuila, México",
      region: "América Central",
      market: "LATAM",
      items: [
        {
          productName: "adidas Youth Germany Black/Red Away Match Soc",
          category: "Girls' Apparel",
          quantity: 1,
          total: 68.6,
        },
        {
          productName: "Under Armour Men's Tech II T-Shirt",
          category: "Lacrosse",
          quantity: 1,
          total: 22.74,
        },
      ],
      total: 91.34,
      probableCause: null,
    });
  });

  it("armadilha de fuso: hora antes de 03:00Z não leva o pedido para o dia anterior", () => {
    // Pedido 552 da Silver. Sanidade: com new Date(), em UTC-3 ele cairia em 08/01.
    const placedAt = "2015-01-09T01:02:00.000Z";
    expect(new Date(placedAt).toLocaleDateString("sv-SE")).toBe("2015-01-08");

    const order = mapOrder({
      ...row375,
      data_pedido: placedAt,
      data_prevista_entrega: "2015-01-13T01:02:00.000Z",
      data_envio: "2015-01-12T01:02:00.000Z",
      situacao_rastreio: "Entregue",
    });

    expect(order.orderDate).toBe("2015-01-09");
    expect(order.estimatedDeliveryDate).toBe("2015-01-13");
    expect(order.actualDeliveryDate).toBe("2015-01-12");
  });

  it.each([
    ["Entregue", "2015-01-12"],
    ["Em Trânsito", null],
    ["Aguardando Liberação", null],
    ["Cancelado", null],
  ])(
    "com situação %s, actualDeliveryDate = %s (data_envio vem sempre preenchida)",
    (status, date) => {
      expect(mapOrder({ ...row375, situacao_rastreio: status }).actualDeliveryDate).toBe(date);
    },
  );

  it.each([
    ["", null],
    ["0", 0],
    ["-1", -1],
  ])("dias_atraso %j vira delayDays %j", (text, days) => {
    expect(mapOrder({ ...row375, dias_atraso: text }).delayDays).toBe(days);
  });

  it.each([
    ["0. Não Avaliado (Aguardando Liberação)", "Não Avaliado (Aguardando Liberação)"],
    ["1. Adiantado (< 0 dias)", "Adiantado (< 0 dias)"],
    ["5. Envios Cancelados", "Envios Cancelados"],
    ["Sem prefixo", "Sem prefixo"],
  ])("remove o prefixo de ordenação da janela: %s", (text, window) => {
    expect(mapOrder({ ...row375, janela_atraso: text }).delayWindow).toBe(window);
  });

  it("soma os itens em centavos, sem erro de ponto flutuante", () => {
    const order = mapOrder(
      { ...row375, valor_item_pedido: "0.1" },
      { ...row375, valor_item_pedido: "0.2" },
    );

    expect(order.total).toBe(0.3);
  });

  it("monta origem e destino sem partes vazias", () => {
    const order = mapOrder({ ...row375, origem_cliente_estado: "", destino_estado: "" });

    expect(order.origin).toBe("San Benito, Estados Unidos");
    expect(order.destination).toBe("Saltillo, México");
  });

  it.each([
    ["situacao_rastreio", "Extraviado", "trackingStatus"],
    ["status_entrega_pt", "Late delivery", "deadlineStatus"],
    ["modo_envio", "Express", "shippingMode"],
    ["mercado_logistico", "Brasil", "market"],
    ["data_pedido", "", "orderDate"],
    ["data_prevista_entrega", "31/01/2018", "estimatedDeliveryDate"],
    ["dias_atraso", "1.5", "delayDays"],
    ["quantidade_item", "abc", "items.0.quantity"],
    ["quantidade_item", "", "items.0.quantity"],
    ["valor_item_pedido", "", "items.0.total"],
    ["nome_produto", "", "items.0.productName"],
  ] as const)("recusa %s = %j, apontando %s", (column, value, field) => {
    expect(failedFields({ ...row375, [column]: value })).toContain(field);
  });

  it("nenhuma coluna proibida está entre as colunas lidas", () => {
    const read: readonly string[] = SILVER_COLUMNS;

    expect(FORBIDDEN_COLUMNS.filter((column) => read.includes(column))).toEqual([]);
  });
});
