import { z } from "zod";

/** Origem dos pedidos (`DATA_SOURCE`). */
export const dataSourceSchema = z
  .enum(["fixtures", "file"])
  .describe("Origem dos pedidos: fixtures (pedidos de exemplo no código) ou file (Silver em CSV)");
export type DataSource = z.infer<typeof dataSourceSchema>;

/** Resposta de `GET /api/health`. */
export const healthResponseSchema = z.object({
  status: z.literal("ok").describe("A API está no ar e os pedidos já foram carregados"),
  dataSource: dataSourceSchema,
  orders: z.number().int().nonnegative().describe("Quantidade de pedidos carregados"),
});
export type HealthResponse = z.infer<typeof healthResponseSchema>;
