import { z } from "zod";

/** Formato padrão de erro da API: código em caixa alta e mensagem em pt-BR. */
export const errorResponseSchema = z.object({
  error: z.object({
    code: z
      .string()
      .regex(/^[A-Z][A-Z0-9_]*$/)
      .describe("Código do erro em caixa alta, ex.: VALIDATION_ERROR"),
    message: z.string().min(1).describe("Mensagem em pt-BR, pronta para exibir"),
  }),
});

export type ErrorResponse = z.infer<typeof errorResponseSchema>;
