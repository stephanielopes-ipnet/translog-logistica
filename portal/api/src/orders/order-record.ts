import { staffOrderSchema } from "@translog/contracts";
import { z } from "zod";

/**
 * O que a API guarda de cada pedido: só o que vem da base (com as causas nos termos da base),
 * uma vez por pedido. As duas respostas são projeções dele, montadas a cada consulta em
 * `order-views.ts`:
 *
 * - `Order` (cliente): campos do cliente, com o motivo em linguagem do cliente;
 * - `StaffOrder` (colaborador): tudo, mais o diagnóstico calculado (prazo sugerido, trânsito,
 *   dias por etapa, contexto da modalidade e da rota, valor em risco).
 *
 * O diagnóstico não é guardado: sai barato de calcular por pedido e assim não ocupa memória nem
 * prende o cache do Databricks ao cenário da Gold. Fixtures e cache local guardam este formato.
 */
export const orderRecordSchema = staffOrderSchema
  .omit({
    dispatchDiagnosis: true,
    transportDiagnosis: true,
    stageDays: true,
    dataOrigin: true,
    context: true,
    valueAtRisk: true,
  })
  .extend({
    daysToDispatch: z
      .number()
      .int()
      .nonnegative()
      .nullable()
      .describe("Dias do pedido até o despacho (`dias_ate_despacho`); null = não despachado"),
  });

export type OrderRecord = z.infer<typeof orderRecordSchema>;
