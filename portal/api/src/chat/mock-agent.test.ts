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

describe("mock-agent: pedido 375 (demo)", () => {
  it("'por que atrasou' explica o motivo provável sem afirmar a causa", async () => {
    const reply = await ask("Por que meu pedido atrasou?", await fixture(375));

    expect(reply).toBe(
      "O motivo provável do atraso do pedido **#375** é **Promessa irreal**: o prazo de 2 dias da " +
        "modalidade Second Class provavelmente foi curto para a rota internacional " +
        "Texas → Saltillo (México).",
    );
  });

  it("'quando chega' informa a previsão e os dias de atraso", async () => {
    const reply = await ask("Quando meu pedido chega?", await fixture(375));

    expect(reply).toBe(
      "O pedido **#375** está **Em Trânsito**. A entrega estava prevista para **08/01/2015** e " +
        "acumula **4 dias de atraso**.",
    );
  });

  it("o botão 'Perguntar ao assistente' da tela é respondido com o motivo provável", async () => {
    const reply = await ask("Por que o pedido #375 atrasou?", await fixture(375));

    expect(reply).toMatch(/^O motivo provável do atraso do pedido \*\*#375\*\*/);
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
    const reply = await ask("Qual o status do pedido 15?");

    expect(reply).toContain("**#15**");
    expect(reply).toContain("**Entregue**");
  });

  it("só o número do pedido: responde a situação", async () => {
    expect(await ask("#562")).toBe(
      "O pedido **#562** está **Aguardando Liberação**. Depois de liberado, a entrega está " +
        "prevista para **13/01/2015**.",
    );
  });

  it("ignora acentos e maiúsculas", async () => {
    expect(await ask("QUANDO CHEGA?", await fixture(375))).toContain("**Em Trânsito**");
    expect(await ask("situação", await fixture(1002))).toContain("**Cancelado**");
  });
});

describe("mock-agent: situações", () => {
  it.each([
    {
      orderId: 15,
      when: "O pedido **#15** foi **Entregue** em **07/01/2015**, 2 dias após a data prevista (05/01/2015).",
      why: "O pedido **#15** foi entregue com **2 dias de atraso**, mas não há um motivo provável específico registrado na base para esta remessa.",
    },
    {
      orderId: 20322,
      when: "O pedido **#20322** foi **Entregue** em **27/10/2015**, 1 dia antes da data prevista.",
    },
    {
      orderId: 10453,
      when: "O pedido **#10453** foi **Entregue** em **06/06/2015**, dentro do prazo previsto.",
    },
    {
      orderId: 31398,
      when: "O pedido **#31398** está **Em Trânsito**, dentro do prazo, com entrega prevista para **07/04/2016**.",
    },
    {
      orderId: 562,
      why: "O pedido **#562** não está atrasado no transporte. Ele está **Aguardando Liberação** com previsão para **13/01/2015**.",
    },
    {
      orderId: 1002,
      when: "O pedido **#1002** foi **Cancelado** e não será enviado.",
      why: "O pedido **#1002** foi **Cancelado**, portanto não há atraso de transporte a analisar.",
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

  it("pedido sem atraso: diz que não há atraso e repete a previsão", async () => {
    expect(await ask("Por que atrasou?", await fixture(31398))).toBe(
      "O pedido **#31398** não apresenta atraso. O pedido **#31398** está **Em Trânsito**, " +
        "dentro do prazo, com entrega prevista para **07/04/2016**.",
    );
  });

  it("'Promessa irreal' em rota nacional e em Same Day", async () => {
    const domestic = { ...(await fixture(31398)), probableCause: "Promessa irreal" };
    const sameDay = { ...(await fixture(41906)), probableCause: "Promessa irreal" };

    expect(await ask("Por que atrasou?", domestic)).toContain(
      "o prazo de 4 dias da modalidade Standard Class provavelmente foi curto para a rota " +
        "Geórgia → Chicago (Estados Unidos).",
    );
    expect(await ask("Por que atrasou?", sameDay)).toContain(
      "o envio no mesmo dia (Same Day) provavelmente tinha prazo curto demais para a rota " +
        "internacional Califórnia → Bur Sudan (Sudão).",
    );
  });

  it("outro motivo provável aparece sem detalhe inventado", async () => {
    const order = { ...(await fixture(15)), probableCause: "Clima" };

    expect(await ask("Por que atrasou?", order)).toBe(
      "O motivo provável do atraso do pedido **#15** é **Clima**.",
    );
  });

  it("nenhuma resposta apresenta a causa como comprovada nem fala em pagamento", async () => {
    const all = await Promise.all(
      [15, 375, 562, 1002, 10453, 20322, 31398, 225, 41906, 16, 552].map(fixture),
    );
    const replies = await Promise.all(
      all.flatMap((order) => [ask("Quando chega?", order), ask("Por que atrasou?", order)]),
    );

    for (const reply of replies) {
      expect(reply).not.toMatch(/comprovad|com certeza|causa do atraso|pagamento/i);
      if (/motivo/i.test(reply)) {
        expect(reply).toMatch(/motivo provável/);
      }
    }
  });
});
