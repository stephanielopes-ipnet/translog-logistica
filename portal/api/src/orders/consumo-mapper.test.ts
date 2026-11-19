import { readFileSync } from "node:fs";
import { parse } from "csv-parse/sync";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  type EventRow,
  FORBIDDEN_COLUMNS,
  type ItemRow,
  mapConsumoOrder,
  type OrderRow,
  READ_COLUMNS,
} from "./consumo-mapper.ts";
import { consumoFiles } from "./file-repository.ts";
import type { OrderRecord } from "./order-record.ts";

/**
 * Amostra das 3 tabelas com os pedidos da demo (gerada por `pnpm --filter @translog/api
 * fixtures`): valores reais nas colunas lidas, FICTICIO-* nas proibidas, SEM-USO nas demais.
 */
const SAMPLE = consumoFiles(new URL("./fixtures/consumo/", import.meta.url).pathname);

type CsvRecord = Record<string, string>;
const read = (file: string): CsvRecord[] => parse(readFileSync(file, "utf8"), { columns: true });
const orderRecords = read(SAMPLE.orders);
const itemRecords = read(SAMPLE.items);
const eventRecords = read(SAMPLE.events);

function pick<Column extends string>(record: CsvRecord, columns: readonly Column[]) {
  return Object.fromEntries(columns.map((column) => [column, record[column] ?? ""])) as Record<
    Column,
    string
  >;
}

/** Linhas do pedido na amostra, só com as colunas lidas (como o adapter entrega ao mapper). */
function rowsOf(orderId: number): { row: OrderRow; items: ItemRow[]; events: EventRow[] } {
  const id = String(orderId);
  const record = orderRecords.find((candidate) => candidate.id_pedido === id);
  if (!record) {
    throw new Error(`Pedido ${orderId} fora da amostra`);
  }
  return {
    row: pick(record, READ_COLUMNS.orders),
    items: itemRecords
      .filter((item) => item.id_pedido === id)
      .map((r) => pick(r, READ_COLUMNS.items)),
    events: eventRecords
      .filter((event) => event.id_pedido === id)
      .map((r) => pick(r, READ_COLUMNS.events)),
  };
}

function mapOrder(row: OrderRow, items: ItemRow[], events: EventRow[]): OrderRecord {
  const result = mapConsumoOrder(row, items, events);
  if (!result.success) {
    throw new Error(z.prettifyError(result.error));
  }
  return result.data;
}

function mapSample(orderId: number, change: Partial<OrderRow> = {}): OrderRecord {
  const { row, items, events } = rowsOf(orderId);
  return mapOrder({ ...row, ...change }, items, events);
}

/** Caminhos dos campos que falharam na validação. */
function failedFields(row: OrderRow, items: ItemRow[], events: EventRow[]): string[] {
  const result = mapConsumoOrder(row, items, events);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join("."));
}

describe("mapConsumoOrder: pedidos da demo", () => {
  it("375: entregue com atraso, despacho e entrega separados, linha do tempo completa", () => {
    const order = mapSample(375);

    expect(order).toMatchObject({
      orderId: 375,
      orderDate: "2015-01-06",
      referenceDate: "2018-02-06",
      status: "Entregue com atraso",
      shippingMode: "Second Class",
      transportMode: "Aéreo consolidado",
      routeType: "Internacional",
      origin: "San Benito, Texas, Estados Unidos",
      destination: "Saltillo, Coahuila, México",
      region: "América Central",
      market: "LATAM",
      routeService: "América Latina - América Central - Second Class",
      daysToDispatch: 6,
      dispatch: {
        promisedDays: 2,
        expectedDate: "2015-01-08",
        actualDate: "2015-01-12",
        delayDays: 4,
        status: "Atrasado",
        probableCause: "Atraso operacional",
      },
      delivery: {
        expectedDate: "2015-01-13",
        actualDate: "2015-01-17",
        delayDays: 4,
        probableCause: "Atraso no despacho não recuperado no transporte",
      },
      explanation:
        "Despacho em 6 dia(s), 4 dia(s) além do prazo de despacho de 2 dia(s). Atraso " +
        "operacional na expedição. O transporte seguiu o prazo padrão da rota e a entrega " +
        "ficou 4 dia(s) atrasada.",
      currentStage: { number: 5, label: "Última milha" },
      currentLocation: "Entregue em Saltillo - Coahuila (México)",
      lostAtStage: null,
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
      escalateToSupport: true,
    });
    expect(order.events[3]).toStrictEqual({
      date: "2015-01-13",
      code: "PARTIDA_VOO",
      description: "Partida do voo",
      stage: 2,
      stageLabel: "Voo",
      location: "Em voo: Miami -> Cidade do México (México)",
    });
  });

  it("375: datas dos eventos iguais à coluna linha_do_tempo da base", () => {
    // linha_do_tempo: 06/01 Pedido registrado · 12/01 Pedido despachado · 13/01 Recebido no
    // gateway · 13/01 Partida do voo · 14/01 Chegada à alfândega · 15/01 Liberado · 16/01
    // Chegada ao CD · 16/01 Saiu para entrega · 17/01/2015 Entregue.
    const timeline = mapSample(375).events.map((event) => `${event.date} ${event.description}`);

    expect(timeline).toEqual([
      "2015-01-06 Pedido registrado",
      "2015-01-12 Pedido despachado",
      "2015-01-13 Recebido no gateway de origem",
      "2015-01-13 Partida do voo",
      "2015-01-14 Chegada à alfândega",
      "2015-01-15 Liberado pela alfândega",
      "2015-01-16 Chegada ao centro de distribuição",
      "2015-01-16 Saiu para entrega",
      "2015-01-17 Entregue",
    ]);
  });

  it("76902: em trânsito, parado na alfândega de Jacarta, com Promessa irreal no despacho", () => {
    expect(mapSample(76902)).toMatchObject({
      status: "Em trânsito",
      shippingMode: "First Class",
      transportMode: "Aéreo expresso",
      origin: "San Jose, Califórnia, Estados Unidos",
      destination: "Jacarta, Jacarta, Indonésia",
      dispatch: {
        promisedDays: 1,
        expectedDate: "2018-01-28",
        actualDate: "2018-01-29",
        delayDays: 1,
        status: "Atrasado",
        probableCause: "Promessa irreal",
      },
      delivery: {
        expectedDate: "2018-02-01",
        actualDate: null,
        delayDays: 5,
        probableCause: "Volume sem atualização de rastreio",
      },
      currentStage: { number: 3, label: "Alfândega" },
      currentLocation: "Alfândega Jacarta (Indonésia)",
      lostAtStage: null,
      escalateToSupport: true,
    });
    expect(mapSample(76902).events.at(-1)).toMatchObject({
      date: "2018-01-31",
      code: "CHEGADA_ALFANDEGA",
      location: "Alfândega Jacarta (Indonésia)",
    });
  });

  it("34: extraviado na alfândega, sem data nem atraso de entrega, encaminhado à central", () => {
    const order = mapSample(34);

    expect(order).toMatchObject({
      status: "Extraviado",
      delivery: { expectedDate: "2015-01-05", actualDate: null, delayDays: null },
      lostAtStage: { number: 3, label: "Alfândega" },
      currentLocation: "Volume não localizado após: Alfândega Tegucigalpa (Honduras)",
      escalateToSupport: true,
    });
    expect(order.events.at(-1)).toMatchObject({ code: "EXTRAVIO_CONFIRMADO", stage: 3 });
  });

  it("9: não pago (expirado), só o registro, sem prazos, etapa nem explicação", () => {
    expect(mapSample(9)).toMatchObject({
      status: "Não pago (expirado)",
      transportMode: null,
      dispatch: {
        promisedDays: 4,
        expectedDate: null,
        actualDate: null,
        delayDays: null,
        status: "Não Avaliado",
        probableCause: null,
      },
      delivery: { expectedDate: null, actualDate: null, delayDays: null, probableCause: null },
      explanation: null,
      currentStage: null,
      currentLocation: null,
      lostAtStage: null,
      events: [
        {
          date: "2015-01-01",
          code: "PEDIDO_CRIADO",
          description: "Pedido registrado",
          stage: 0,
          stageLabel: "Pedido",
          location: "Pedido registrado no sistema",
        },
      ],
      escalateToSupport: false,
    });
  });

  it("31298: doméstica rodoviária, sem voo nem alfândega; 'Sem atraso' vira null", () => {
    const order = mapSample(31298);

    expect(order).toMatchObject({
      status: "Entregue no prazo",
      routeType: "Doméstica",
      transportMode: "Rodoviário",
      dispatch: { delayDays: 2, probableCause: "Atraso operacional" },
      delivery: { delayDays: 0, probableCause: null },
      escalateToSupport: false,
    });
    expect(order.events.map((event) => event.stageLabel)).not.toContain("Voo");
    expect(order.events.map((event) => event.stageLabel)).not.toContain("Alfândega");
  });

  it("8: 'N itens' conta linhas; as unidades (qtd_itens = 13) somam as quantidades", () => {
    const order = mapSample(8);

    expect(order.items).toHaveLength(4);
    expect(order.items.reduce((sum, item) => sum + item.quantity, 0)).toBe(13);
    expect(order.total).toBe(587.77);
  });
});

describe("mapConsumoOrder: colunas da visão do colaborador", () => {
  it("375: resumo para a IA e linha do tempo bruta, como vêm da base", () => {
    const order = mapSample(375);

    expect(order.aiSummary).toMatch(/^Pedido nº 375, feito em 06\/01\/2015\. Itens: /);
    expect(order.rawTimeline).toMatch(
      /^06\/01\/2015 Pedido registrado · 12\/01\/2015 Pedido despachado/,
    );
  });

  it("apara o espaço do fim do resumo (o Databricks o tem; o CSV do Mateus, não)", () => {
    const { row } = rowsOf(9);

    expect(mapSample(9, { resumo_pedido: `${row.resumo_pedido} ` }).aiSummary).toBe(
      mapSample(9).aiSummary,
    );
  });

  it("9: não despachado não tem dias até o despacho", () => {
    expect(mapSample(9).daysToDispatch).toBeNull();
  });

  it.each([
    ["dias_ate_despacho", "1.5", "daysToDispatch"],
    ["dias_ate_despacho", "-1", "daysToDispatch"],
    ["rota_servico", "", "routeService"],
  ] as const)("recusa %s = %j, apontando %s", (column, value, field) => {
    const { row, items, events } = rowsOf(375);

    expect(failedFields({ ...row, [column]: value }, items, events)).toContain(field);
  });

  it("resumo e linha do tempo vazios viram null", () => {
    expect(mapSample(375, { resumo_pedido: "", linha_do_tempo: "" })).toMatchObject({
      aiSummary: null,
      rawTimeline: null,
    });
  });
});

describe("mapConsumoOrder: datas", () => {
  // Pedido 76385: nos CSVs do Mateus, data_pedido = 2018-01-20T00:43:00.000Z (UTC). A amostra
  // vem do export (datas já cortadas no SQL); estes testes recolocam o horário na linha.
  const PLACED_AT = "2018-01-20T00:43:00.000Z";

  function withTimestamps(orderId: number) {
    const { row, items, events } = rowsOf(orderId);
    const [first, ...rest] = events;
    if (!first) throw new Error("sem eventos");
    return {
      row: { ...row, data_pedido: PLACED_AT },
      items,
      events: [{ ...first, ts_evento: PLACED_AT }, ...rest],
    };
  }

  it("armadilha de fuso: hora antes de 03:00Z não leva o pedido para o dia anterior", () => {
    // Sanidade: com new Date(), em Brasília (os testes rodam em America/Sao_Paulo, no horário
    // de verão) cairia em 19/01.
    expect(new Date(PLACED_AT).toLocaleDateString("sv-SE")).toBe("2018-01-19");
    const { row, items, events } = withTimestamps(76385);

    const order = mapOrder(row, items, events);

    expect(order.orderDate).toBe("2018-01-20");
    expect(order.events[0]?.date).toBe("2018-01-20");
  });

  it("aceita o formato dos CSVs do Mateus (timestamp) igual ao do export (data cortada)", () => {
    const { row, items, events } = withTimestamps(76385);

    expect(mapOrder(row, items, events)).toStrictEqual(mapSample(76385));
  });

  it.each([
    ["data_pedido", "", "orderDate"],
    ["data_pedido", "06/01/2015", "orderDate"],
    ["data_entrega_prevista", "2015-13-01", "delivery.expectedDate"],
    ["data_referencia_base", "", "referenceDate"],
  ] as const)("recusa %s = %j, apontando %s", (column, value, field) => {
    const { row, items, events } = rowsOf(375);

    expect(failedFields({ ...row, [column]: value }, items, events)).toContain(field);
  });

  it("recusa evento sem data", () => {
    const { row, items, events } = rowsOf(375);
    const [first, ...rest] = events;
    if (!first) throw new Error("sem eventos");

    expect(failedFields(row, items, [{ ...first, ts_evento: "" }, ...rest])).toContain(
      "events.0.date",
    );
  });
});

describe("mapConsumoOrder: regras de conversão", () => {
  it("ordena itens por id_item_pedido e eventos por sequencia, venham como vierem", () => {
    const { row, items, events } = rowsOf(375);

    expect(mapOrder(row, items.toReversed(), events.toReversed())).toStrictEqual(mapSample(375));
  });

  it("ordena sequências numericamente (10 depois de 9)", () => {
    const { row, items, events } = rowsOf(222);

    const order = mapOrder(row, items, events.toReversed());

    expect(order.events).toHaveLength(10);
    expect(order.events[0]?.code).toBe("PEDIDO_CRIADO");
    expect(order.events.at(-1)?.code).toBe("ENTREGUE");
  });

  it("soma os itens em centavos, sem erro de ponto flutuante", () => {
    const { row, items, events } = rowsOf(375);
    const [first, second] = items;
    if (!first || !second) throw new Error("itens faltando");

    const order = mapOrder(
      row,
      [
        { ...first, valor_item_pedido: "0.1" },
        { ...second, valor_item_pedido: "0.2" },
      ],
      events,
    );

    expect(order.total).toBe(0.3);
  });

  it.each([
    ["Sem atraso", null],
    ["", null],
    ["Promessa irreal", "Promessa irreal"],
  ])("causa %j vira probableCause %j", (text, cause) => {
    expect(mapSample(375, { causa_atraso_despacho: text }).dispatch.probableCause).toBe(cause);
  });

  it.each([
    ["Padrão (despacho em 4 dias)", "Standard Class"],
    ["Rápido (despacho em 2 dias)", "Second Class"],
    ["Prioritário (despacho em 1 dia)", "First Class"],
    ["Expresso (despacho no mesmo dia)", "Same Day"],
    ["First Class", "First Class"],
  ])("modo de envio %j vira %j", (text, mode) => {
    expect(mapSample(375, { modo_envio: text }).shippingMode).toBe(mode);
  });

  it("monta origem e destino sem partes vazias", () => {
    const order = mapSample(375, { origem_cliente_estado: "", destino_estado: "" });

    expect(order.origin).toBe("San Benito, Estados Unidos");
    expect(order.destination).toBe("Saltillo, México");
  });

  it("recusa pedido sem itens ou sem eventos", () => {
    const { row, items, events } = rowsOf(375);

    expect(failedFields(row, [], events)).toContain("items");
    expect(failedFields(row, items, [])).toContain("events");
  });

  it.each([
    ["situacao_pedido", "Entregue", "status"],
    ["status_prazo_despacho", "Late delivery", "dispatch.status"],
    ["modo_envio", "Express", "shippingMode"],
    ["modal_transporte", "Marítimo", "transportMode"],
    ["tipo_rota", "Nacional", "routeType"],
    ["mercado_logistico", "Brasil", "market"],
    ["dias_atraso_entrega", "1.5", "delivery.delayDays"],
    ["prazo_despacho_dias", "", "dispatch.promisedDays"],
    ["etapa_atual_desc", "Alfândega", "currentStage.number"],
    ["etapa_extravio", "9 - Marte", "lostAtStage.number"],
  ] as const)("recusa %s = %j, apontando %s", (column, value, field) => {
    const { row, items, events } = rowsOf(375);

    expect(failedFields({ ...row, [column]: value }, items, events)).toContain(field);
  });

  it.each([
    ["quantidade_item", "abc", "items.0.quantity"],
    ["quantidade_item", "", "items.0.quantity"],
    ["valor_item_pedido", "", "items.0.total"],
    ["nome_produto", "", "items.0.productName"],
  ] as const)("recusa item com %s = %j, apontando %s", (column, value, field) => {
    const { row, items, events } = rowsOf(375);
    const [first, ...rest] = items;
    if (!first) throw new Error("sem itens");

    expect(failedFields(row, [{ ...first, [column]: value }, ...rest], events)).toContain(field);
  });

  it("nenhuma coluna proibida está entre as colunas lidas", () => {
    for (const columns of Object.values(READ_COLUMNS)) {
      const readColumns: readonly string[] = columns;
      expect(FORBIDDEN_COLUMNS.filter((column) => readColumns.includes(column))).toEqual([]);
    }
  });
});
