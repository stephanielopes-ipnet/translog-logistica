import type { Order } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { createFixturesRepository } from "../orders/fixtures-repository.ts";
import { createOrderService } from "../orders/order-service.ts";
import { ASK_NUMBER_REPLY, createMockAgent, FALLBACK_REPLY, MODES_REPLY } from "./mock-agent.ts";

const SESSION = "11111111-1111-4111-8111-111111111111";
const repository = await createFixturesRepository();
const orders = createOrderService({ orders: repository, sampleOrderIds: [] });
const agent = createMockAgent({ orders });

async function fixture(orderId: number): Promise<Order> {
  const order = await orders.findOrder(orderId);
  if (!order) {
    throw new Error(`Pedido ${orderId} fora dos fixtures`);
  }
  return order;
}

function ask(message: string, order: Order | null = null) {
  return agent.reply({ sessionId: SESSION, message, order });
}

describe("mock-agent: pedido 76902 (demo)", () => {
  it("'por que atrasou' traz o motivo provável de cada etapa e o aviso da central", async () => {
    const reply = await ask("Por que meu pedido atrasou?", await fixture(76902));

    expect(reply).toBe(
      "Motivo provável do atraso do pedido **#76902**: no despacho, **Promessa irreal**; na " +
        "entrega, **Volume sem atualização de rastreio**. Este caso deve ser tratado pela " +
        "central de atendimento (segunda a sexta, das 9h às 18h).",
    );
  });

  it("'quando chega' informa a previsão, os dias de atraso e onde está", async () => {
    const reply = await ask("Quando meu pedido chega?", await fixture(76902));

    expect(reply).toBe(
      "O pedido **#76902** está **Em trânsito**. A entrega estava prevista para **01/02/2018** e " +
        "acumula **5 dias de atraso**. Agora: **Alfândega Jacarta (Indonésia)**.",
    );
  });

  it("o botão 'Perguntar ao assistente' da tela é respondido com o motivo provável", async () => {
    const reply = await ask("Por que o pedido #76902 atrasou?", await fixture(76902));

    expect(reply).toMatch(/^Motivo provável do atraso do pedido \*\*#76902\*\*/);
  });
});

describe("mock-agent: regras gerais", () => {
  it("modalidades de envio", async () => {
    expect(await ask("Quais são as modalidades de envio?")).toBe(MODES_REPLY);
    expect(await ask("Quais os tipos de envio?", await fixture(375))).toBe(MODES_REPLY);
  });

  it("sem pedido, pede o número", async () => {
    expect(await ask("Quando meu pedido chega?")).toBe(ASK_NUMBER_REPLY);
    expect(await ask("Por que atrasou?")).toBe(ASK_NUMBER_REPLY);
  });

  it("fora do escopo, diz o que sabe fazer", async () => {
    expect(await ask("Qual a capital da França?")).toBe(FALLBACK_REPLY);
    expect(await ask("Bom dia!", await fixture(375))).toBe(FALLBACK_REPLY);
  });

  it("pedido citado inexistente: diz que não encontrou", async () => {
    const expected = "Não encontrei o pedido **#99999**. Confira o número e tente novamente.";

    expect(await ask("Onde está o pedido 99999?")).toBe(expected);
    expect(await ask("99999")).toBe(expected);
    expect(await ask("E o pedido 99999?", await fixture(375))).toBe(expected);
  });

  it("número sem a palavra 'pedido' que não existe: segue com o pedido aberto", async () => {
    expect(await ask("Chega em 99999 horas?", await fixture(375))).toContain("**#375**");
  });

  it("pedido citado existente é consultado na fonte, mesmo sem contexto", async () => {
    const reply = await ask("Qual o status do pedido 8?");

    expect(reply).toContain("**#8**");
    expect(reply).toContain("**Entregue no prazo**");
  });

  it("só o número do pedido: responde a situação", async () => {
    expect(await ask("#9")).toBe(
      "O pedido **#9** está como **Não pago (expirado)** e não foi despachado.",
    );
  });

  it("ignora acentos e maiúsculas", async () => {
    expect(await ask("QUANDO CHEGA?", await fixture(76902))).toContain("**Em trânsito**");
    expect(await ask("situação", await fixture(50))).toContain("**Cancelado**");
  });
});

describe("mock-agent: situações", () => {
  it.each([
    {
      orderId: 375,
      when: "O pedido **#375** foi **Entregue com atraso** em **17/01/2015**, 4 dias após a data prevista (13/01/2015).",
      why:
        "Motivo provável do atraso do pedido **#375**: no despacho, **Atraso operacional**; na " +
        "entrega, **Atraso no despacho não recuperado no transporte**. Este caso deve ser " +
        "tratado pela central de atendimento (segunda a sexta, das 9h às 18h).",
    },
    {
      orderId: 222,
      why:
        "Motivo provável do atraso do pedido **#222**: no despacho, **Promessa irreal**; na " +
        "entrega, **Atraso no despacho não recuperado no transporte**.",
    },
    {
      orderId: 34,
      when: "O volume do pedido **#34** foi **Extraviado** na etapa **Alfândega**.",
    },
    {
      orderId: 8,
      when: "O pedido **#8** foi **Entregue no prazo** em **10/01/2015**.",
      why: "O pedido **#8** não apresenta atraso. O pedido **#8** foi **Entregue no prazo** em **10/01/2015**.",
    },
    {
      orderId: 76385,
      when: "O pedido **#76385** está **Em trânsito**. A entrega estava prevista para **31/01/2018** e acumula **6 dias de atraso**. Agora: **Em voo: Los Angeles -> Sydney (Austrália)**.",
    },
    {
      orderId: 9,
      why: "O pedido **#9** está como **Não pago (expirado)**, portanto não há atraso de transporte a analisar.",
    },
    {
      orderId: 50,
      when: "O pedido **#50** foi **Cancelado** e não será enviado.",
      why: "O pedido **#50** está como **Cancelado**, portanto não há atraso de transporte a analisar.",
    },
  ])("pedido $orderId", async ({ orderId, when, why }) => {
    const order = await fixture(orderId);
    if (when) {
      expect(await ask("Quando chega?", order)).toBe(when);
    }
    if (why) {
      expect(await ask("Qual o motivo do atraso?", order)).toBe(why);
    }
  });

  it("extravio: explica e encaminha à central", async () => {
    expect(await ask("Por que atrasou?", await fixture(34))).toBe(
      "O volume do pedido **#34** foi **Extraviado** na etapa **Alfândega**. Motivo provável " +
        "do atraso: no despacho, **Promessa irreal**. Este caso deve ser tratado pela central " +
        "de atendimento (segunda a sexta, das 9h às 18h).",
    );
  });

  it("entregue adiantado: diz quantos dias antes", async () => {
    const early = await fixture(8);
    const order: Order = { ...early, delivery: { ...early.delivery, delayDays: -2 } };

    expect(await ask("Quando chega?", order)).toBe(
      "O pedido **#8** foi **Entregue no prazo** em **10/01/2015**, 2 dias antes da data prevista.",
    );
  });

  it("nenhuma resposta apresenta a causa como comprovada nem fala em tipo de pagamento", async () => {
    const all = await Promise.all([76902, 375, 34, 222, 8, 9, 50, 31298, 76385].map(fixture));
    const replies = await Promise.all(
      all.flatMap((order) => [ask("Quando chega?", order), ask("Por que atrasou?", order)]),
    );

    for (const reply of replies) {
      expect(reply).not.toMatch(/comprovad|com certeza|causa do atraso|tipo de pagamento/i);
      if (/motivo/i.test(reply)) {
        expect(reply).toMatch(/[Mm]otivo provável/);
      }
    }
  });
});
