import { existsSync } from "node:fs";
import { loadConfig } from "./config.ts";
import { buildServer } from "./server.ts";

// .env da pasta portal/, se existir. Variáveis já definidas no ambiente têm prioridade.
// (Não usamos `node --env-file-if-exists`: com `--watch` e sem .env, o Node 24.21 aborta no Ctrl+C.)
const envFile = new URL("../../.env", import.meta.url);
if (existsSync(envFile)) {
  process.loadEnvFile(envFile);
}

/**
 * Configuração → container (carga dos pedidos) → servidor → porta.
 * Qualquer falha até aqui (variável inválida, arquivo de pedidos ausente, porta ocupada)
 * encerra com código 1 e uma mensagem dizendo o que está errado.
 */
async function bootstrap() {
  const config = loadConfig();
  const app = await buildServer(config);

  async function shutdown(signal: NodeJS.Signals) {
    app.log.info(`${signal} recebido; encerrando a API.`);
    try {
      await app.close();
      process.exit(0);
    } catch (error) {
      app.log.error({ err: error }, "Erro ao encerrar a API");
      process.exit(1);
    }
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);

  await app.listen({ host: "0.0.0.0", port: config.apiPort });
  app.log.info(`Documentação em http://localhost:${config.apiPort}/docs`);
}

try {
  await bootstrap();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
}
