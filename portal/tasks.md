# Tarefas do portal

Checklist por fase. Plano completo em `portal/_contexto/backend-analise.md` (local). Ao fim de cada tarefa: `pnpm lint`, `pnpm typecheck`, `pnpm test`, marcar aqui e commitar.

## Fases 0 e 1: fundação, contratos e API de pedidos

- [x] **1. Fundação**: workspace pnpm em `portal/`, configs (TS, Biome, Vitest), `contracts` com `errors` e `health`, `config.ts`, bootstrap único no `main.ts`, `server.ts` com swagger e error handler, `GET /api/health`, `CLAUDE.md`, `tasks.md`.
- [x] **2. Contrato de pedidos + fixtures**: `orderSchema` e afins; porta `OrderRepository`; `fixtures-repository` com os 11 pedidos validados ao carregar; `order-service`; `GET /api/orders/:orderId` e `/samples`; testes de rota (200, 404, 400, samples) e varredura de chaves proibidas em todas as respostas.
- [x] **3. Mapper + adapter `file`**: `silver-mapper.ts`; leitura da Silver em streaming; testes com CSV de fixture (15, 375, 562, 1002 iguais a `mocks-silver.json`), descarte das colunas proibidas, linha inválida, armadilha de fuso; teste de integração com a Silver real (só se o arquivo existir).
- [x] **4. Docker**: `Dockerfile` da API, `docker-compose.yml` só com a API (fixtures), `docker-compose.silver.yml` com a Silver por volume somente leitura; README com dev, Docker e Silver.
- [ ] **5. Verificação final**: `fixtures` e `file` com a Silver real; pedidos 15, 375, 562, 1002 e um inexistente; tempo de carga e memória; `docker compose up --build`.

## Próximas fases (fora desta etapa)

- [ ] **2. Chat com mock**: contrato do chat, `ChatService` com trava por sessão (`409`), histórico com limite, agente mock com as regras do protótipo, `502`. Depende do acordo com o Marco.
- [ ] **3. Agente ADK**: adapter `adk`, extração da resposta final, timeout, recriação de sessão; agente no compose. Depende do acordo com o Marco.
- [ ] **Tela React** (`portal/web`): depois do design fechado no protótipo HTML.
