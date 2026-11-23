import { z } from "zod";
import { deliverySchema, dispatchSchema, marketSchema, orderSchema } from "./orders.ts";

// Visão do colaborador (`GET /api/staff/orders/:orderId`, protegida): tudo o que o cliente vê,
// mais o diagnóstico ("o que falhou, onde, quanto, comparado com o quê, o que é dado real e o
// que é simulado"). Continua sem dados do cliente, de pagamento e financeiros internos.

const baseCause = z
  .string()
  .min(1)
  .nullable()
  .describe(
    "Motivo provável nesta etapa, nos termos da base (ex.: Promessa irreal). " +
      "null = sem atraso ou não se aplica. Nunca é causa comprovada",
  );

const days = z.number().int();

const percent = z
  .number()
  .min(0)
  .max(100)
  .nullable()
  .describe("Percentual com 1 casa decimal (0 a 100); null = sem pedidos para calcular");

/** Diagnóstico do despacho: prometido × realizado. */
export const dispatchDiagnosisSchema = z.object({
  promisedDays: days.nonnegative().describe("Prazo de despacho prometido pela modalidade, em dias"),
  daysToDispatch: days
    .nonnegative()
    .nullable()
    .describe("Dias do pedido até o despacho (`dias_ate_despacho`); null = não despachado"),
  delayDays: days.nullable().describe("Dias além do prometido; negativo = adiantado"),
});
export type DispatchDiagnosis = z.infer<typeof dispatchDiagnosisSchema>;

/** Diagnóstico do transporte (do despacho à entrega). */
export const transportDiagnosisSchema = z.object({
  standardTransitDays: days
    .nullable()
    .describe("Trânsito padrão da rota: entrega prevista − despacho previsto, em dias"),
  actualTransitDays: days
    .nullable()
    .describe("Trânsito real: entrega realizada − despacho real; null = ainda não entregue"),
  recoveredDays: days
    .nullable()
    .describe(
      "Dias recuperados no transporte: padrão − real (negativo = o transporte atrasou); " +
        "null = ainda não entregue",
    ),
});
export type TransportDiagnosis = z.infer<typeof transportDiagnosisSchema>;

/** Dias em uma etapa da viagem, contados por data dos eventos (os horários da base são sintéticos). */
export const stageDaysSchema = z.object({
  stage: z.number().int().min(0).max(5).describe("Número da etapa, de 0 (Pedido) a 5"),
  label: z.string().min(1).describe("Nome da etapa"),
  days: days
    .nonnegative()
    .describe(
      "Dias do primeiro evento da etapa ao primeiro da etapa seguinte; na última, até o último " +
        "evento (ou até a data de referência, se o pedido ainda está nela)",
    ),
  ongoing: z.boolean().describe("O pedido ainda está nesta etapa na data de referência"),
});
export type StageDays = z.infer<typeof stageDaysSchema>;

export const dataOriginSchema = z
  .enum(["real", "simulado"])
  .describe("real = dado do DataCo; simulado = gerado pela simulação de rastreio do grupo");
export type DataOrigin = z.infer<typeof dataOriginSchema>;

/** De onde vem cada parte do pedido (honestidade para a banca). */
export const staffDataOriginSchema = z.object({
  dispatch: dataOriginSchema.describe("Despacho (datas, prazo e atraso)"),
  transport: dataOriginSchema.describe("Transporte e eventos depois do despacho"),
  delivery: dataOriginSchema.describe("Entrega (datas e atraso)"),
  loss: dataOriginSchema.describe("Extravio"),
});
export type StaffDataOrigin = z.infer<typeof staffDataOriginSchema>;

/** O pedido comparado com os outros da mesma modalidade e da mesma rota (calculado na carga). */
export const orderContextSchema = z.object({
  shippingMode: z.object({
    dispatchedOrders: days.nonnegative().describe("Pedidos despachados nesta modalidade"),
    lateDispatchPct: percent.describe("% dos despachos desta modalidade que atrasaram"),
  }),
  route: z.object({
    evaluatedDeliveries: days
      .nonnegative()
      .describe("Pedidos desta rota com atraso de entrega calculado (entregues ou em trânsito)"),
    lateDeliveryPct: percent.describe("% das entregas desta rota (`rota_servico`) que atrasaram"),
  }),
});
export type OrderContext = z.infer<typeof orderContextSchema>;

/**
 * Pedido como o **colaborador** vê: o `Order` do cliente com as causas nos termos da base, a
 * frase técnica, o mercado e a rota, e o diagnóstico (despacho, transporte, etapas, contexto e
 * valor em risco). Sem dados do cliente, de pagamento nem financeiros internos.
 */
export const staffOrderSchema = orderSchema.extend({
  dispatch: dispatchSchema.extend({ probableCause: baseCause }),
  delivery: deliverySchema.extend({ probableCause: baseCause }),
  market: marketSchema,
  routeService: z
    .string()
    .min(1)
    .describe("Rota de serviço da base (`rota_servico`): mercado - região - modalidade"),
  explanation: z
    .string()
    .min(1)
    .nullable()
    .describe("Frase técnica da base sobre prazos e ocorrências (`motivo_ocorrencia`)"),
  dispatchDiagnosis: dispatchDiagnosisSchema,
  transportDiagnosis: transportDiagnosisSchema,
  stageDays: z
    .array(stageDaysSchema)
    .describe("Dias em cada etapa que o pedido percorreu, em ordem"),
  dataOrigin: staffDataOriginSchema,
  context: orderContextSchema,
  valueAtRisk: z
    .number()
    .nonnegative()
    .nullable()
    .describe("Total do pedido em dólar quando extraviado ou atrasado na entrega; senão null"),
  aiSummary: z
    .string()
    .min(1)
    .nullable()
    .describe("Resumo do pedido escrito para a IA (`resumo_pedido`), sem dado do cliente"),
  rawTimeline: z
    .string()
    .min(1)
    .nullable()
    .describe("Linha do tempo bruta da base (`linha_do_tempo`)"),
});
export type StaffOrder = z.infer<typeof staffOrderSchema>;
