import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    // Os testes não compartilham estado global; sem isolar cada arquivo, a suíte roda mais rápido.
    isolate: false,
  },
});
