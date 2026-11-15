# Tarefas do portal

Checklist por fase. Plano completo em `portal/_contexto/backend-analise.md` (local). Ao fim de cada tarefa: `pnpm lint`, `pnpm typecheck`, `pnpm test`, marcar aqui e commitar.

## Fases 0 e 1: fundação, contratos e API de pedidos

- [x] **1. Fundação**: workspace pnpm em `portal/`, configs (TS, Biome, Vitest), `contracts` com `errors` e `health`, `config.ts`, bootstrap único no `main.ts`, `server.ts` com swagger e error handler, `GET /api/health`, `CLAUDE.md`, `tasks.md`.
- [x] **2. Contrato de pedidos + fixtures**: `orderSchema` e afins; porta `OrderRepository`; `fixtures-repository` com os 11 pedidos validados ao carregar; `order-service`; `GET /api/orders/:orderId` e `/samples`; testes de rota (200, 404, 400, samples) e varredura de chaves proibidas em todas as respostas.
- [x] **3. Mapper + adapter `file`**: `silver-mapper.ts`; leitura da Silver em streaming; testes com CSV de fixture (15, 375, 562, 1002 iguais a `mocks-silver.json`), descarte das colunas proibidas, linha inválida, armadilha de fuso; teste de integração com a Silver real (só se o arquivo existir).
- [x] **4. Docker**: `Dockerfile` da API, `docker-compose.yml` só com a API (fixtures), `docker-compose.silver.yml` com a Silver por volume somente leitura; README com dev, Docker e Silver.
- [x] **5. Verificação final**: `fixtures` e `file` com a Silver real; pedidos 15, 375, 562, 1002 e um inexistente; tempo de carga e memória; `docker compose up --build`. Resultado (14/11): 65.752 pedidos, 0 linhas inválidas, carga ~10,5–11,3 s, RSS ~350 MB (Docker ~285 MiB); os 65.752 pedidos batem com a implementação de referência em Python (só o `probableCause` do 375 difere, ver README).

## Fase 2: chat com o assistente (simulado e agente ADK)

Decidido em 15/11 seguir sem esperar o acordo com o Marco: o que depende dele fica isolado em `withOrderContext` (`chat/adk-agent.ts`) e na configuração.

- [x] **1. Contrato + chat simulado no backend**: `contracts/chat.ts` (`chatRequestSchema`, `chatResponseSchema`, `agentModeSchema`), `health` com `agent`, porta `SupportAgent`, `chat-service` (pedido citado, trava por sessão → `409 CHAT_BUSY`, log sem conteúdo), `mock-agent` com as regras que estavam na tela, `POST /api/chat`, erros `409`/`502`/`504` em `http/errors.ts`, config `AGENT` (só `mock`). Testes de serviço, simulado, rota e privacidade do chat.
- [x] **2. Adapter ADK**: `adk-events.ts` (`extractFinalText` com os casos de teste do agente), `adk-agent.ts` (sessão criada na primeira mensagem, `409` = ok, `404` → recria e reenvia uma vez, timeout → `504`, falha → `502`, `Map` de sessões com expiração), config `AGENT_URL`, `AGENT_APP_NAME`, `AGENT_TIMEOUT_MS`; testes contra servidor HTTP falso; teste com o agente real só com `AGENT_IT_URL` (desligado por padrão).
- [ ] **3. Tela ligada à rota**: `postJson`, envio por `POST /api/chat` (mutation sem retry), `sessionId` por conversa, pedido citado abrindo o rastreio, erros (`504` com texto próprio); regra de respostas removida do frontend (presets da barra com textos fixos).
- [ ] **4. Docs e verificação final**: `docs/backend.md`, `README.md`, `.env.example`, `CLAUDE.md`; roteiro da banca com `AGENT=mock` e com `AGENT=adk` contra o agente real.

## Próximas fases (fora desta etapa)

- [ ] **Agente no Docker Compose**: depende do Dockerfile do agente na `main` (Marco).
- [x] **Tela React** (`portal/web`): pacote `@translog/web` com o design da Direção D (`translog-prototipo-direcao-d.html`), integrado ao `@translog/contracts` e consultando `/api/health`, `/api/orders/samples` e `/api/orders/:orderId` reais, chat com mock (`mock-chat-service`) e barra de controle (`ProtoBar`) com as variantes das pendências.
