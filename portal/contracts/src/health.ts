import { z } from "zod";
import { agentModeSchema } from "./chat.ts";

/** Origem dos pedidos (`DATA_SOURCE`). */
export const dataSourceSchema = z
  .enum(["fixtures", "file"])
  .describe(
    "Origem dos pedidos: fixtures (pedidos de exemplo no código) ou file (tabelas consumo_* " +
      "exportadas em CSV)",
  );
export type DataSource = z.infer<typeof dataSourceSchema>;

/** Resposta de `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal("ok").describe("A API está no ar e os pedidos já foram carregados"),
  dataSource: dataSourceSchema,
  orders: z.number().int().nonnegative().describe("Quantidade de pedidos carregados"),
  agent: agentModeSchema.describe(
    "Assistente configurado no chat (só informa o modo; não consulta o agente)",
  ),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
