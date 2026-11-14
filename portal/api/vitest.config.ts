import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Os testes não compartilham estado global; sem isolar cada arquivo, a suíte roda mais rápido.
    isolate: false,
    // Fuso de Brasília: o teste da armadilha de fuso (hora antes de 03:00Z) só prova algo fora de UTC.
    env: { TZ: "America/Sao_Paulo" },
  },
});
