import type { Order } from "@translog/contracts";
import { describe, expect, it } from "vitest";
import { createFixturesRepository } from "../orders/fixtures-repository.ts";
import { createOrderService } from "../orders/order-service.ts";
import {
  ASK_NUMBER_REPLY,
  createMockAgent,
  FALLBACK_REPLY,
  GREETING_REPLY,
  MODES_REPLY,
  SUPPORT_REPLY,
} from "./mock-agent.ts";

const SESSION = "11111111-1111-4111-8111-111111111111";
const repository = await createFixturesRepository();
const orders = createOrderService({
  orders: repository,
  sampleOrderIds: [],
});
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

/** Trecho do aviso de encaminhamento à central nas respostas. */
const CENTRAL = "caso é acompanhado pela nossa **central de atendimento**";

describe("mock-agent: roteiro da banca (76902)", () => {
  it("'por que atrasou' traz o motivo provável de cada etapa e o aviso da central", async () => {
    expect(await ask("Por que meu pedido atrasou?", await fixture(76902))).toBe(
      "Sinto muito pelo atraso do pedido **#76902**. No despacho, que saiu 1 dia depois do " +
        "prometido, o motivo provável é que **o prazo de despacho prometido para esta modalidade " +
        "costuma ser curto demais** (First Class: 1 dia para despachar). Na entrega, o motivo " +
        "provável é que **seu pedido está sem novas atualizações de rastreio**. Como a entrega " +
        "já está 5 dias atrasada, este caso é acompanhado pela nossa **central de atendimento**, " +
        "que funciona de **segunda a sexta, das 9h às 18h**.",
    );
  });

  it("'quando chega' informa onde está, a previsão e os dias de atraso", async () => {
    expect(await ask("Quando meu pedido chega?", await fixture(76902))).toBe(
      "O pedido **#76902** está **em trânsito**. No momento, ele está em **Alfândega Jacarta " +
        "(Indonésia)** (etapa Alfândega). A entrega estava prevista para **01/02/2018** e já soma " +
        "**5 dias de atraso**. Sinto muito pela espera. Como a entrega já está 5 dias atrasada, " +
        "este caso é acompanhado pela nossa **central de atendimento**, que funciona de " +
        "**segunda a sexta, das 9h às 18h**.",
    );
  });

  it("'onde está' responde o local atual e desde quando", async () => {
    expect(await ask("Onde está meu pedido?", await fixture(76902))).toMatch(
      /^O pedido \*\*#76902\*\* está em \*\*Alfândega Jacarta \(Indonésia\)\*\* \(etapa Alfândega\), desde 31\/01\/2018\./,
    );
  });

  it("o botão 'Perguntar ao assistente' da tela é respondido com o motivo provável", async () => {
    expect(await ask("Por que o pedido #76902 atrasou?", await fixture(76902))).toMatch(
      /^Sinto muito pelo atraso do pedido \*\*#76902\*\*\. No despacho/,
    );
  });
});

describe("mock-agent: sem pedido aberto", () => {
  it("cumprimento: apresenta o assistente e pede o número", async () => {
    expect(await ask("Bom dia!")).toBe(GREETING_REPLY);
    expect(GREETING_REPLY).toContain("LogBot");
  });

  it.each(["Quando meu pedido chega?", "Por que atrasou?", "Quero acompanhar meu pedido"])(
    "%s → pede o número",
    async (message) => {
      expect(await ask(message)).toBe(ASK_NUMBER_REPLY);
    },
  );

  it("pedido citado existente é consultado na fonte, mesmo sem contexto", async () => {
    const reply = await ask("Qual o status do pedido 8?");

    expect(reply).toBe(
      "Boa notícia: o pedido **#8** foi **entregue no prazo** em **10/01/2015**, em São Paulo - " +
        "São Paulo (Brasil).",
    );
  });

  it("pedido citado inexistente: diz que não encontrou, com gentileza", async () => {
    const expected =
      "Não encontrei o pedido **#99999** na nossa base. Pode conferir o número? Ele tem só " +
      "dígitos, como 76902.";

    expect(await ask("Onde está o pedido 99999?")).toBe(expected);
    expect(await ask("99999")).toBe(expected);
    expect(await ask("E o pedido 99999?", await fixture(375))).toBe(expected);
  });
});

describe("mock-agent: regras gerais", () => {
  it("modalidades de envio", async () => {
    expect(await ask("Quais são as modalidades de envio?")).toBe(MODES_REPLY);
    expect(await ask("Quais os tipos de envio?", await fixture(375))).toBe(MODES_REPLY);
  });

  it("central: horário e regra; diz se o pedido aberto se enquadra", async () => {
    expect(await ask("Como falo com a central?")).toBe(SUPPORT_REPLY);
    expect(await ask("Quero falar com um atendente", await fixture(8))).toBe(SUPPORT_REPLY);
    expect(await ask("Como falo com a central?", await fixture(375))).toBe(
      `${SUPPORT_REPLY} O pedido **#375** se enquadra: a entrega atrasou 4 dias.`,
    );
    expect(SUPPORT_REPLY).toContain("segunda a sexta, das 9h às 18h");
    expect(SUPPORT_REPLY).toContain("3 dias ou mais");
  });

  it("cumprimento com pedido aberto cita o pedido", async () => {
    expect(await ask("Olá", await fixture(76902))).toBe(
      "Olá! Estou com o pedido **#76902** aberto. Posso contar onde ele está, quando chega ou o " +
        "motivo provável de um atraso.",
    );
  });

  it("fora do escopo, diz com gentileza o que sabe fazer", async () => {
    expect(await ask("Qual a capital da França?")).toBe(FALLBACK_REPLY);
    expect(await ask("Me conta uma piada", await fixture(375))).toBe(FALLBACK_REPLY);
  });

  it("número sem a palavra 'pedido' que não existe: segue com o pedido aberto", async () => {
    expect(await ask("Chega em 99999 horas?", await fixture(375))).toContain("**#375**");
  });

  it("só o número do pedido: responde a situação", async () => {
    expect(await ask("#9")).toBe(
      "O pagamento do pedido **#9** não foi confirmado e ele **expirou** sem ser despachado, " +
        "então não há entrega prevista.",
    );
  });

  it("ignora acentos e maiúsculas", async () => {
    expect(await ask("QUANDO CHEGA?", await fixture(76902))).toContain("**em trânsito**");
    expect(await ask("situação", await fixture(50))).toContain("**cancelado**");
  });
});

describe("mock-agent: linguagem do cliente", () => {
  it("nunca usa os termos internos da base nem a estatística da frase técnica", async () => {
    const replies: string[] = [];
    for (const id of [76902, 375, 34, 222, 8, 9, 50, 31298, 76385]) {
      for (const message of ["Por que atrasou?", "Qual a situação?", "Onde está?"]) {
        replies.push(await ask(message, await fixture(id)));
      }
    }

    for (const reply of replies) {
      expect(reply).not.toMatch(
        /Promessa irreal|Atraso operacional|não recuperado no transporte|Volume sem atualização|cumprido em apenas|\d[.,]\d%|Pacific Asia/,
      );
    }
  });
});

describe("mock-agent: situações", () => {
  it.each([
    {
      orderId: 375,
      status:
        "O pedido **#375** foi **entregue** em **17/01/2015**, em Saltillo - Coahuila (México), " +
        "**4 dias depois** do previsto (13/01/2015). Sinto muito pelo atraso. Como a entrega " +
        "atrasou 4 dias, este caso é acompanhado pela nossa **central de atendimento**, que " +
        "funciona de **segunda a sexta, das 9h às 18h**.",
      why:
        "Sinto muito pelo atraso do pedido **#375**. No despacho, que saiu 4 dias depois do " +
        "prometido, o motivo provável é que **houve demora na preparação do envio**. Na entrega, " +
        "o motivo provável é que **a demora na saída não foi compensada durante a viagem**. Como " +
        "a entrega atrasou 4 dias, este caso é acompanhado pela nossa **central de atendimento**, " +
        "que funciona de **segunda a sexta, das 9h às 18h**.",
    },
    {
      orderId: 222,
      why:
        "Sinto muito pelo atraso do pedido **#222**. No despacho, que saiu 1 dia depois do " +
        "prometido, o motivo provável é que **o prazo de despacho prometido para esta modalidade " +
        "costuma ser curto demais** (First Class: 1 dia para despachar). Na entrega, o motivo " +
        "provável é que **a demora na saída não foi compensada durante a viagem**.",
    },
    {
      orderId: 34,
      status:
        "Sinto muito: o volume do pedido **#34** foi **extraviado** na etapa **Alfândega**. " +
        "Último registro em 11/01/2015: Volume não localizado após: Alfândega Tegucigalpa " +
        "(Honduras). Como houve extravio, este caso é acompanhado pela nossa **central de " +
        "atendimento**, que funciona de **segunda a sexta, das 9h às 18h**.",
      why:
        "Sinto muito: o volume do pedido **#34** foi **extraviado** na etapa **Alfândega**. " +
        "Último registro em 11/01/2015: Volume não localizado após: Alfândega Tegucigalpa " +
        "(Honduras). Antes disso, no despacho, que saiu 1 dia depois do prometido, o motivo " +
        "provável é que **o prazo de despacho prometido para esta modalidade costuma ser curto " +
        "demais** (First Class: 1 dia para despachar). Como houve extravio, este caso é acompanhado pela nossa **central de atendimento**, que " +
        "funciona de **segunda a sexta, das 9h às 18h**.",
    },
    {
      orderId: 8,
      why:
        "Boa notícia: o pedido **#8** não tem atraso na entrega. Ele foi entregue em " +
        "**10/01/2015**, em São Paulo - São Paulo (Brasil).",
    },
    {
      orderId: 31298,
      why:
        "Boa notícia: o pedido **#31298** não tem atraso na entrega. O despacho atrasou (motivo " +
        "provável: houve demora na preparação do envio), mas o transporte recuperou o tempo. Ele " +
        "foi entregue em **06/04/2016**, em Henderson - Kentucky (Estados Unidos).",
    },
    {
      orderId: 9,
      why:
        "O pedido **#9** não chegou a ser despachado: o pagamento não foi confirmado e ele " +
        "**expirou**. Por isso não há atraso de transporte a analisar.",
    },
    {
      orderId: 50,
      status:
        "O pedido **#50** foi **cancelado** e não será enviado. Se tiver dúvidas, estou por aqui.",
      why:
        "O pedido **#50** foi **cancelado** e não será enviado, então não há atraso de " +
        "transporte a analisar.",
    },
  ])("pedido $orderId", async ({ orderId, status, why }) => {
    const order = await fixture(orderId);
    if (status) {
      expect(await ask("Qual a situação?", order)).toBe(status);
    }
    expect(await ask("Qual o motivo do atraso?", order)).toBe(why);
  });

  it("em trânsito dentro do prazo e entregue adiantado", async () => {
    const transit = await fixture(76902);
    const onTime: Order = {
      ...transit,
      delivery: { ...transit.delivery, delayDays: 0, probableCause: null },
      escalateToSupport: false,
    };
    const delivered = await fixture(8);
    const early: Order = { ...delivered, delivery: { ...delivered.delivery, delayDays: -2 } };

    expect(await ask("Quando chega?", onTime)).toBe(
      "O pedido **#76902** está **em trânsito**. No momento, ele está em **Alfândega Jacarta " +
        "(Indonésia)** (etapa Alfândega). A entrega está prevista para **01/02/2018**, tudo dentro " +
        "do prazo até agora.",
    );
    expect(await ask("Quando chega?", early)).toContain("Chegou 2 dias antes do previsto.");
  });

  it("aguardando pagamento: prazo de despacho depois da confirmação", async () => {
    const order: Order = { ...(await fixture(9)), status: "Aguardando pagamento" };

    expect(await ask("Quando chega?", order)).toBe(
      "O pedido **#9** está **aguardando a confirmação do pagamento**. Depois dela, o despacho " +
        "sai em até 4 dias (Standard Class).",
    );
  });

  it("nenhuma resposta apresenta a causa como comprovada nem fala do tipo de pagamento", async () => {
    const all = await Promise.all([76902, 375, 34, 222, 8, 9, 50, 31298, 76385].map(fixture));
    const replies = await Promise.all(
      all.flatMap((order) => [
        ask("Quando chega?", order),
        ask("Onde está?", order),
        ask("Por que atrasou?", order),
      ]),
    );

    for (const reply of replies) {
      expect(reply).not.toMatch(/comprovad|com certeza|causa do atraso|tipo de pagamento|cliente/i);
      if (/motivo/i.test(reply)) {
        expect(reply).toMatch(/motivo provável/i);
      }
    }
  });

  it("só encaminha à central os pedidos marcados pela API", async () => {
    const all = await Promise.all([76902, 375, 34, 222, 8, 9, 50, 31298, 76385].map(fixture));

    for (const order of all) {
      const reply = await ask("Por que atrasou?", order);
      expect(reply.includes(CENTRAL), `pedido ${order.orderId}`).toBe(order.escalateToSupport);
    }
  });
});
