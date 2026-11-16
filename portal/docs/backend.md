# Portal TransLog: documentação técnica (Backend e Frontend)

Para quem vai rodar, revisar ou mudar o código do portal. A visão geral, sem detalhes técnicos, está no [README](../README.md).

Estado em 15/11/2026: fundação, contrato `@translog/contracts`, API de pedidos e de chat `@translog/api` e interface `@translog/web` (Direção D) concluídas. O chat responde pelo assistente simulado (`AGENT=mock`, padrão) ou pelo agente ADK do Marco (`AGENT=adk`), conferido pela tela contra o agente real em 15/11. O que ainda depende do acordo com o Marco fica isolado em `withOrderContext` e na configuração (seção 10.8). Checklist em [tasks.md](../tasks.md).

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Estrutura de pastas](#2-estrutura-de-pastas)
3. [Como rodar](#3-como-rodar)
4. [Fluxo: da inicialização à resposta](#4-fluxo-da-inicialização-à-resposta)
5. [Contrato (`@translog/contracts`)](#5-contrato-translogcontracts)
6. [API (`@translog/api`)](#6-api-translogapi)
7. [Configuração](#7-configuração)
8. [Fontes de dados](#8-fontes-de-dados)
9. [Mapeamento Silver → `Order`](#9-mapeamento-silver--order)
10. [Chat e assistente](#10-chat-e-assistente)
11. [Privacidade em camadas](#11-privacidade-em-camadas)
12. [Tratamento de erros](#12-tratamento-de-erros)
13. [Frontend (`@translog/web`)](#13-frontend-translogweb)
14. [Testes](#14-testes)
15. [Docker](#15-docker)
16. [Como fazer mudanças comuns](#16-como-fazer-mudanças-comuns)
17. [Convenções](#17-convenções)
18. [Decisões técnicas](#18-decisões-técnicas)
19. [Limitações e próximos passos](#19-limitações-e-próximos-passos)

## 1. Visão geral

O portal é um monorepo pnpm dividido em três pacotes:

- **`@translog/contracts` (`contracts/`)**: esquemas Zod compartilhados que definem o contrato HTTP, geram o OpenAPI em `/docs` e tipam tanto o backend quanto o frontend.
- **`@translog/api` (`api/`)**: API HTTP em Fastify que entrega à tela o pedido pronto para exibir (view model `Order`), lendo de 11 pedidos de exemplo versionados (`fixtures`) ou da base Silver em CSV (`file`), e responde o chat (`POST /api/chat`) pelo assistente simulado ou pelo agente ADK do Marco. Os pedidos são carregados uma vez na inicialização e consultados em memória em $O(1)$.
- **`@translog/web` (`web/`)**: Single-Page Application em React 19 + Vite 8 + Tailwind CSS v4 que implementa o design da **Direção D** (estética de manifesto de carga internacional combinada com rota e linha do tempo de 4 etapas integradas) e consome a API real via `@tanstack/react-query`, validando todas as respostas no cliente com os esquemas de `@translog/contracts`.

```
Navegador (@translog/web, :5173)  ──►  API do portal (@translog/api, :3333)  ──►  Silver CSV / fixtures
                                                │
                                                └──►  Assistente do chat (AGENT):
                                                        mock: regras na própria API
                                                        adk:  agente ADK do Marco (:8001) ──► Gemini
```

A tela fala só com a API do portal (via proxy `/api` no Vite em desenvolvimento), nunca direto com o agente. A chave do Gemini fica restrita ao processo do agente: nunca no portal, no código, nos testes, nos logs ou no navegador.

### Stack

| Peça | Versão | Pacote | Observação |
|---|---|---|---|
| Node.js | 24 (`engines` `>=24.11.0 <25`; imagem `node:24.22.3-alpine3.24`) | todos | Executa o TypeScript direto na API, sem etapa de build |
| pnpm | 12.18.0 (via corepack) | todos | Workspace com `catalog` de versões compartilhadas |
| TypeScript | 7.0.2 | todos | `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly` |
| Zod | 4.6.7 | `contracts`, `api`, `web` | Esquemas do contrato, validação na API e no cliente HTTP |
| Fastify | 5.12.8 | `api` | Servidor HTTP |
| fastify-type-provider-zod | 7.0.0 | `api` | Liga Zod ao Fastify (validação, serialização, OpenAPI) |
| @fastify/swagger + swagger-ui | 9.9.3 + 6.1.3 | `api` | OpenAPI em `/docs` |
| csv-parse | 7.0.3 | `api` | Leitura da Silver em streaming |
| pino-pretty | 13.2.0 | `api` | Log legível em desenvolvimento (não vai para a imagem) |
| React + React DOM | 19.3.1 | `web` | Interface declarativa com hooks |
| Vite + @vitejs/plugin-react | 8.3.8 + 6.2.1 | `web` | Dev server com proxy `/api` e bundler de produção |
| Tailwind CSS + @tailwindcss/vite | 4.3.5 | `web` | Estilização utility-first com `@theme inline` e `@custom-variant dark` |
| @tanstack/react-query | 5.107.1 | `web` | Cache, estado assíncrono, retentativas e sincronização com a API |
| lucide-react | 1.72.0 | `web` | Ícones consistentes com os protótipos |
| @fontsource-variable/inter | 5.3.0 | `web` | Fonte `Inter Variable` empacotada localmente |
| Vitest | 5.1.0 | `api`, `web` | Testes unitários e de integração (254 testes, mais 1 de integração com o agente real, desligado por padrão) |
| Biome | 2.6.7 | todos | Lint, formatação, acessibilidade e ordem dos imports |

Tamanho aproximado: ~1.600 linhas de código na API + ~3.100 no frontend (das quais ~400 são os pedidos de exemplo dos testes), cobertos por **254 testes automatizados** (209 na API + 45 no frontend). O chat não trouxe dependência nova: o adapter do agente usa o `fetch` nativo do Node.

## 2. Estrutura de pastas

`portal/` é a raiz do workspace pnpm. O resto do repositório (`agent/`, `pipeline/`, `bases/`, `dashboard/`, `docs/`) pertence a outras pessoas do grupo.

```
portal/
├── package.json             # scripts do workspace (dev, start, build, test, lint, format, typecheck)
├── pnpm-workspace.yaml      # pacotes (api, contracts, web), catalog de versões, savePrefix ""
├── pnpm-lock.yaml
├── tsconfig.base.json       # opções de TypeScript compartilhadas
├── biome.json               # regras de lint/format; ignora _contexto/, dados/, prototipos/, dist/ e *.md
├── .nvmrc                   # 24
├── .env.example             # todas as variáveis, comentadas
├── .dockerignore
├── docker-compose.yml       # API com fixtures
├── docker-compose.silver.yml  # sobreposição: API com a Silver por volume
├── README.md                # visão geral (não técnica)
├── CLAUDE.md                # regras e comandos para o assistente de código
├── tasks.md                 # checklist por fase
├── docs/backend.md          # este documento técnico (backend + frontend)
├── prototipos/              # protótipos HTML da tela (A, B, C e Direção D escolhida)
├── dados/                   # cópia local da Silver (no .gitignore; nunca versionar)
├── contracts/               # @translog/contracts
│   └── src/
│       ├── index.ts         # reexporta tudo
│       ├── orders.ts        # Order, enums, params e resposta de samples
│       ├── chat.ts          # corpo e resposta de POST /api/chat, AgentMode
│       ├── health.ts        # resposta do health, DataSource
│       └── errors.ts        # formato padrão de erro
├── api/                     # @translog/api
│   ├── Dockerfile
│   ├── vitest.config.ts     # isolate: false, TZ=America/Sao_Paulo
│   └── src/
│       ├── main.ts          # bootstrap: .env → config → servidor → listen
│       ├── server.ts        # Fastify, swagger, error handler, container, rotas (health inline)
│       ├── config.ts        # variáveis de ambiente validadas
│       ├── container.ts     # único lugar que escolhe os adapters (dados e assistente)
│       ├── http/
│       │   └── errors.ts    # único lugar que transforma erros em resposta HTTP
│       ├── privacy.test.ts  # varredura de chaves e valores proibidos em todas as respostas (pedidos e chat)
│       ├── chat/
│       │   ├── routes.ts              # POST /api/chat
│       │   ├── chat-service.ts        # pedido de contexto, trava por conversa, log sem conteúdo, ChatBusyError
│       │   ├── cited-orders.ts        # números de pedido citados no texto
│       │   ├── support-agent.ts       # porta SupportAgent + AgentUnavailableError e AgentTimeoutError
│       │   ├── mock-agent.ts          # adapter mock: regras e textos do assistente simulado
│       │   ├── adk-agent.ts           # adapter adk: sessões, POST /run, withOrderContext (provisório)
│       │   └── adk-events.ts          # extractFinalText (mesma regra do extract_final_text do agente)
│       └── orders/
│           ├── routes.ts              # GET /api/orders/samples e /api/orders/:orderId
│           ├── order-service.ts       # regras de consulta + OrderNotFoundError
│           ├── order-repository.ts    # porta OrderRepository + repositório em memória
│           ├── fixtures-repository.ts # adapter fixtures
│           ├── file-repository.ts     # adapter file (Silver CSV em streaming)
│           ├── silver-mapper.ts       # linhas da Silver → Order (único arquivo que conhece a Silver)
│           └── fixtures/
│               ├── orders.json        # 11 pedidos de exemplo (vão para a imagem)
│               └── silver-amostra.csv # amostra da Silver para testes (não vai para a imagem)
└── web/                     # @translog/web (React 19 + Vite 8 + Tailwind v4)
    ├── index.html           # ponto de entrada HTML (pt-BR, título e fontes IBM Plex Mono)
    ├── package.json
    ├── tsconfig.json        # bundler resolution, jsx: react-jsx, noEmit
    ├── vite.config.ts       # plugin React + Tailwind, proxy /api → http://127.0.0.1:3333
    └── src/
        ├── main.tsx         # QueryClientProvider + montagem do App
        ├── app.tsx          # composição geral: URL state, queries, troca de pedido, atalhos e chat
        ├── index.css        # @theme inline, @custom-variant dark, classes .label-mono, .perf-t, .route-line
        ├── api/
        │   ├── client.ts    # getJson/postJson + validação Zod com @translog/contracts + classe ApiError
        │   ├── fixtures.ts  # espelho dos 11 pedidos de exemplo, usado só nos testes da tela
        │   └── queries.ts   # useHealth, useOrderSamples, useOrderQuery, useSendChatMessage e shouldRetry
        ├── lib/
        │   ├── format.ts    # formatDate (sem new Date), formatCurrency (USD), formatManifestCode
        │   ├── url-state.ts # leitura e escrita de ?pedido= e presets de apresentação (?t, ?c, ?s, ?r, ?n, ?bar)
        │   └── utils.ts     # utilitário cn() para classes condicionais
        ├── components/
        │   └── app-header.tsx # cabeçalho com marca TransLog, manifesto e badge de status da API
        └── features/
            ├── tracking/
            │   ├── timeline.ts            # máquina de estados pura das 4 etapas (buildTimelineSteps)
            │   ├── order-search-form.tsx  # input numérico (1..10 dígitos), validação inline e chips de amostra
            │   ├── tracking-states.tsx    # estados vazio, skeleton, não encontrado, erro de servidor e sem conexão
            │   ├── order-manifest-card.tsx# manifesto principal, grade de 4 colunas, alerta de causa e rota + 4 etapas
            │   ├── order-items-table.tsx  # tabela de itens declarados e rodapé perfurado (.perf-t) com total em USD
            │   └── tracking-panel.tsx     # orquestração da coluna esquerda (60%)
            ├── chat/
            │   ├── chat-session.ts        # regras puras: sessionId, troca de pedido, texto de falha, tipo das mensagens
            │   ├── chat-suggestions.ts    # perguntas sugeridas conforme o pedido aberto
            │   ├── rich-text.ts           # **negrito**, títulos e listas das respostas, sem HTML
            │   ├── chat-messages.tsx      # mensagens, divisor de troca, "digitando…" e falha com "Tentar novamente"
            │   ├── chat-input.tsx         # chips de sugestão contextual + textarea com Enter / Shift+Enter
            │   └── chat-panel.tsx         # coluna direita fixa (400 px) com contexto do pedido ativo
            └── dev-bar/
                ├── chat-presets.ts        # conversas de exemplo da barra, com textos fixos sobre o 375
                └── proto-bar.tsx          # barra recolhível para simular estados e as decisões em aberto
```

Testes ficam ao lado do arquivo testado (`*.test.ts`) tanto em `api/src/` quanto em `web/src/`.

## 3. Como rodar

### Pré-requisitos

- Node 24 (`nvm use` lê o `.nvmrc`) e `corepack enable` (ativa o pnpm 12.18.0 fixado no `package.json`).
- Para Docker: Docker Engine 25 ou mais novo, com Compose (o healthcheck usa `start_interval`).

### Desenvolvimento (API + Frontend simultâneos)

```bash
cd portal
pnpm install
pnpm dev            # sobe API (http://localhost:3333) e Web (http://localhost:5173) em paralelo
```

O comando `pnpm dev` usa `pnpm --parallel --stream -r --filter @translog/api --filter @translog/web dev`:
- `@translog/api` roda com `node --watch` na porta `3333`;
- `@translog/web` roda o servidor do Vite na porta `5173`, fazendo proxy automático de qualquer requisição `/api/*` para `http://127.0.0.1:<API_PORT>` (`API_PORT` e `WEB_PORT` vêm do ambiente ou do `portal/.env`; padrões 3333 e 5173).

Sem `.env`, a API sobe com os `fixtures` (11 pedidos). Para usar a Silver real (65.752 pedidos), copie o arquivo para `portal/dados/silver_pedidos_rastreio.csv` e:

```bash
cp .env.example .env
# no .env:
#   DATA_SOURCE=file
#   ORDERS_FILE=dados/silver_pedidos_rastreio.csv
pnpm dev
```

Com `file`, cada recarga do `--watch` na API relê a Silver (~10 s).

### Chat com o agente ADK (desenvolvimento)

Sem configuração, o chat usa o assistente simulado (`AGENT=mock`). Para usar o agente do Marco, com ele no ar em `127.0.0.1:8001`:

```bash
cp .env.example .env
# no .env:
#   AGENT=adk
#   AGENT_URL=http://127.0.0.1:8001
pnpm dev            # reinicie se já estava rodando: o --watch não relê o .env
curl localhost:3333/api/health   # ..."agent":"adk"
```

Teste automatizado com o agente real (chama o Gemini e gasta cota; desligado por padrão):

```bash
AGENT_IT_URL=http://127.0.0.1:8001 pnpm --filter @translog/api test adk-agent
```

### Docker

```bash
docker compose up --build                                                    # fixtures
docker compose -f docker-compose.yml -f docker-compose.silver.yml up --build # Silver
docker compose down
```

Para não repetir os `-f`, defina `COMPOSE_FILE=docker-compose.yml:docker-compose.silver.yml` no `.env`.

### Comandos do workspace

| Comando | O que faz |
|---|---|
| `pnpm dev` | Sobe API (`:3333`) e frontend Web (`:5173`) em paralelo com hot reload |
| `pnpm start` | Sobe apenas a API sem watch |
| `pnpm build` | Gera o bundle de produção do frontend em `web/dist/` |
| `pnpm test` | Roda o Vitest em todos os pacotes (254 testes: 209 na API + 45 no Web) |
| `pnpm lint` | Biome em todos os pacotes (só verifica) |
| `pnpm format` | Biome corrigindo formatação e imports |
| `pnpm typecheck` | `tsc` em todos os pacotes (`contracts`, `api` e `web`) |
| `pnpm --filter @translog/api <script>` | Executa um script apenas na API |
| `pnpm --filter @translog/web <script>` | Executa um script apenas no frontend |

## 4. Fluxo: da inicialização à resposta

### Inicialização da API

```
main.ts
 ├─ process.loadEnvFile(portal/.env)     só se o arquivo existir; o ambiente tem prioridade
 ├─ loadConfig()                         variáveis validadas, ou erro listando todas as inválidas
 └─ buildServer(config)
     ├─ Fastify + compiladores Zod + error handler + swagger (/docs)
     ├─ createContainer(config, { log: app.log })
     │   ├─ DATA_SOURCE=fixtures → createFixturesRepository()      lê e valida orders.json
     │   ├─ DATA_SOURCE=file     → loadFileRepository(ORDERS_FILE)  lê a Silver inteira
     │   └─ createOrderService({ orders, sampleOrderIds })
     └─ rotas /api/health e /api/orders
 └─ app.listen(0.0.0.0:API_PORT)         só depois de tudo carregado
```

Qualquer falha até o `listen` (variável inválida, arquivo ausente, porta ocupada) cai no `catch` do `bootstrap()`: a mensagem vai para o stderr e o processo sai com código 1. Como a carga acontece antes do `listen`, `/api/health` nunca responde antes de os pedidos estarem prontos. Não existe estado "carregando" no backend.

`SIGINT` e `SIGTERM` fecham o Fastify e saem com código 0.

### Consulta de um pedido (Ponta a Ponta)

```
Usuário digita "375" ou clica no atalho #375 em @translog/web
 ├─ OrderSearchForm valida formato (/^[1-9]\d{0,9}$/) no cliente
 ├─ App atualiza activeOrderId=375 e sincroniza ?pedido=375 via history.replaceState
 ├─ useOrderQuery(375) dispara GET /api/orders/375
 │   ├─ Fastify valida params por orderIdParamsSchema ── falha → 400 VALIDATION_ERROR
 │   ├─ orderService.getOrder(375)
 │   │   └─ orders.findById(375)                         Map em memória, O(1)
 │   │       └─ null → throw OrderNotFoundError ──────── http/errors.ts → 404 ORDER_NOT_FOUND
 │   └─ resposta serializada por orderSchema             campos fora do contrato são descartados → 200
 └─ getJson() valida o JSON no cliente contra orderSchema (@translog/contracts)
     └─ TrackingPanel renderiza OrderManifestCard + OrderItemsTable e sincroniza contexto do ChatPanel
```

### Pergunta no chat (Ponta a Ponta)

```
Usuário clica "Perguntar ao assistente" no pedido 375 (ou digita no chat)
 ├─ App cria o sessionId da conversa (crypto.randomUUID) se ainda não houver
 ├─ useSendChatMessage → POST /api/chat { sessionId, message, orderId: 375 }   sem retry
 │   ├─ Fastify valida o corpo por chatRequestSchema ─────────── falha → 400 VALIDATION_ERROR
 │   ├─ chatService.send
 │   │   ├─ conversa já esperando resposta? ── ChatBusyError ─── http/errors.ts → 409 CHAT_BUSY
 │   │   ├─ contexto: 1º pedido existente citado no texto; senão o aberto (se existir)
 │   │   └─ agent.reply({ sessionId, message, order })
 │   │       ├─ mock: regras de mock-agent.ts                   resposta imediata
 │   │       └─ adk:  cria a sessão (1ª mensagem) → POST /run → extractFinalText
 │   │             ├─ tempo esgotado ── AgentTimeoutError ───── 504 AGENT_TIMEOUT
 │   │             └─ HTTP de erro, JSON inválido, sem resposta final
 │   │                   └─ AgentUnavailableError ───────────── 502 AGENT_UNAVAILABLE
 │   ├─ log: sessão, tamanho, tempo e resultado (nunca o texto)
 │   └─ 200 { sessionId, reply, mentionedOrderId }
 └─ postJson valida com chatResponseSchema
     ├─ mentionedOrderId ≠ pedido aberto → abre esse pedido no rastreio (mesma troca do formulário)
     └─ a resposta entra no chat; em erro, a pergunta fica "Não enviada · Tentar novamente"
```

### Camadas do backend (portas e adapters)

| Camada | Arquivo | Depende de |
|---|---|---|
| Rotas | `orders/routes.ts`, `chat/routes.ts` | `OrderService`/`ChatService` (interfaces) e esquemas do contrato |
| Serviço | `orders/order-service.ts`, `chat/chat-service.ts` | `OrderRepository` (porta); `SupportAgent` (porta) e `OrderService.findOrder` |
| Porta | `orders/order-repository.ts`, `chat/support-agent.ts` | Tipo `Order` do contrato |
| Adapters | `fixtures-repository.ts`, `file-repository.ts`; `mock-agent.ts`, `adk-agent.ts` | Porta, mapper, Node (fs, stream, `fetch`) |
| Composição | `container.ts` | Config e adapters: **único** lugar que escolhe a fonte (`DATA_SOURCE`) e o assistente (`AGENT`) |
| Erros → HTTP | `http/errors.ts` | Erros de domínio: **único** lugar que decide status e mensagem |

Padrão de código: funções fábrica (`createOrderService(deps)`), sem classes de serviço. Classes só para erros de domínio (`OrderNotFoundError`, `ChatBusyError`, `AgentUnavailableError` e `AgentTimeoutError` na API; `ApiError` no cliente HTTP do frontend).

## 5. Contrato (`@translog/contracts`)

Pacote só com código-fonte (`exports` → `src/index.ts`, sem build). Os esquemas Zod:

- validam a entrada da API (params) e a saída (serialização);
- geram o OpenAPI de `/docs`, com as descrições em pt-BR que estão nos `.describe()`;
- validam as respostas recebidas pelo frontend em `web/src/api/client.ts` e fornecem os tipos TypeScript (`z.infer`) para toda a interface React.

| Esquema | Uso |
|---|---|
| `orderSchema` / `Order` | Resposta de `GET /api/orders/:orderId` |
| `orderItemSchema` / `OrderItem` | Item do pedido |
| `orderIdSchema` | Inteiro positivo de até 10 dígitos |
| `orderIdParamsSchema` | Params da rota: texto de 1 a 10 dígitos, maior que zero |
| `orderSamplesResponseSchema` | `{ orderIds: number[] }` |
| `trackingStatusSchema`, `deadlineStatusSchema`, `shippingModeSchema`, `marketSchema` | Enums com os valores da base |
| `healthResponseSchema`, `dataSourceSchema` | `{ status: "ok", dataSource: "fixtures" \| "file", orders, agent }` |
| `agentModeSchema` / `AgentMode` | `"mock" \| "adk"` (`AGENT`); o health só informa o modo, não consulta o agente |
| `chatRequestSchema` / `ChatRequest` | Corpo de `POST /api/chat` |
| `chatResponseSchema` / `ChatResponse` | Resposta de `POST /api/chat` |
| `chatSessionIdSchema`, `CHAT_MESSAGE_MAX_LENGTH` | UUID da conversa; limite de 1000 caracteres da mensagem |
| `errorResponseSchema` | `{ error: { code, message } }` |

### `Order`

| Campo | Tipo | Valores / formato |
|---|---|---|
| `orderId` | inteiro positivo, até 10 dígitos | ex.: `375` |
| `orderDate` | texto `AAAA-MM-DD` | data de calendário, sem hora nem fuso |
| `shippingMode` | enum | `Standard Class`, `Second Class`, `First Class`, `Same Day` |
| `trackingStatus` | enum | `Entregue`, `Em Trânsito`, `Aguardando Liberação`, `Cancelado` |
| `deadlineStatus` | enum | `Atrasado`, `No Prazo`, `Adiantado`, `Não Avaliado`, `Cancelado` |
| `delayDays` | inteiro ou `null` | negativo = adiantado; `null` = não se aplica |
| `delayWindow` | texto | ex.: `Atraso Crítico (3+ dias)` |
| `estimatedDeliveryDate` | texto `AAAA-MM-DD` | |
| `actualDeliveryDate` | texto `AAAA-MM-DD` ou `null` | só em pedidos entregues |
| `origin`, `destination` | texto | `Cidade, Estado, País` |
| `region` | texto | ex.: `América Central` |
| `market` | enum | `LATAM`, `Europe`, `Pacific Asia`, `USCA`, `Africa` |
| `items` | lista, mínimo 1 | `{ productName, category, quantity, total }` |
| `total` | número ≥ 0 | dólar; soma dos itens |
| `probableCause` | texto ou `null` | motivo provável; nunca causa comprovada |

`delayWindow`, `region`, `origin` e `destination` são texto livre de propósito (podem mudar com a Silver nova). O contrato não tem regras entre campos (por exemplo, "`actualDeliveryDate` só se Entregue"): quem garante é o mapper, com testes.

### Chat

| Campo | Tipo | Regra |
|---|---|---|
| `sessionId` (pedido e resposta) | UUID | Gerado pela tela a cada conversa nova (`crypto.randomUUID()`) |
| `message` | texto | Aparado nas pontas e depois medido: 1 a 1000 caracteres |
| `orderId` | número de pedido, `null` ou ausente | Pedido aberto na tela; inexistente é ignorado, sem erro |
| `reply` | texto, mínimo 1 caractere | Resposta do assistente; pode ter `**negrito**`, quebras de linha, títulos (`#`) e listas (`*`, `-`, `•`) |
| `mentionedOrderId` | número de pedido ou `null` | Pedido **existente** citado na mensagem do cliente, para a tela abrir |

O OpenAPI de `/docs` traz um exemplo de corpo e as respostas `200`, `400`, `409`, `502` e `504`.

## 6. API (`@translog/api`)

| Rota | Sucesso | Erros |
|---|---|---|
| `GET /api/health` | `200 { status: "ok", dataSource, orders, agent }` | |
| `GET /api/orders/samples` | `200 { orderIds }`: ids de `SAMPLE_ORDER_IDS` que existem na fonte, na ordem configurada | |
| `GET /api/orders/:orderId` | `200 Order` | `400 VALIDATION_ERROR`, `404 ORDER_NOT_FOUND` |
| `POST /api/chat` | `200 { sessionId, reply, mentionedOrderId }` | `400 VALIDATION_ERROR`, `409 CHAT_BUSY`, `502 AGENT_UNAVAILABLE`, `504 AGENT_TIMEOUT` |
| `GET /docs` | Swagger UI (`/docs/json` = OpenAPI) | |

O `orderId` aceita só dígitos (1 a 10), maior que zero; zeros à esquerda passam (`0015` → 15). `1e3`, `0x1F`, `-1`, `1.5`, espaços e 11 dígitos são recusados.

```bash
curl localhost:3333/api/orders/375
```

```json
{
  "orderId": 375,
  "orderDate": "2015-01-06",
  "shippingMode": "Second Class",
  "trackingStatus": "Em Trânsito",
  "deadlineStatus": "Atrasado",
  "delayDays": 4,
  "delayWindow": "Atraso Crítico (3+ dias)",
  "estimatedDeliveryDate": "2015-01-08",
  "actualDeliveryDate": null,
  "origin": "San Benito, Texas, Estados Unidos",
  "destination": "Saltillo, Coahuila, México",
  "region": "América Central",
  "market": "LATAM",
  "items": [
    { "productName": "adidas Youth Germany Black/Red Away Match Soc", "category": "Girls' Apparel", "quantity": 1, "total": 68.6 },
    { "productName": "Under Armour Men's Tech II T-Shirt", "category": "Lacrosse", "quantity": 1, "total": 22.74 }
  ],
  "total": 91.34,
  "probableCause": "Promessa irreal"
}
```

(Resposta com `fixtures`. Com a Silver, `probableCause` é `null`; ver seção 9.)

```bash
curl localhost:3333/api/orders/99999
# 404 {"error":{"code":"ORDER_NOT_FOUND","message":"Pedido não encontrado. Confira o número e tente novamente."}}
curl localhost:3333/api/orders/abc
# 400 {"error":{"code":"VALIDATION_ERROR","message":"Requisição inválida: orderId: deve ser um número inteiro positivo de até 10 dígitos."}}
```

```bash
curl -X POST localhost:3333/api/chat -H 'content-type: application/json' \
  -d '{"sessionId":"3f2b8c1e-7a4d-4e5f-9b6a-1c2d3e4f5a6b","message":"Por que o pedido #375 atrasou?","orderId":375}'
# 200 (AGENT=mock) {"sessionId":"3f2b8c1e-...","reply":"O motivo provável do atraso do pedido **#375** é **Promessa irreal**: o prazo de 2 dias da modalidade Second Class provavelmente foi curto para a rota internacional Texas → Saltillo (México).","mentionedOrderId":375}
```

## 7. Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `API_PORT` | `3333` | Porta da API (1 a 65535) |
| `DATA_SOURCE` | `fixtures` | `fixtures` ou `file` |
| `ORDERS_FILE` | vazio | CSV da Silver; obrigatório com `file`. Caminho relativo parte de `portal/` |
| `SAMPLE_ORDER_IDS` | `15,375,562,1002` | Lista separada por vírgula; cada item inteiro positivo de até 10 dígitos; repetidos são removidos |
| `AGENT` | `mock` | Assistente do chat: `mock` ou `adk` |
| `AGENT_URL` | vazio | Endereço http(s) do agente; obrigatório com `adk` (dev: `http://127.0.0.1:8001`). Barra final removida |
| `AGENT_APP_NAME` | `translog_agent` | Nome do app no ADK; só letras, números, `_` e `-` (vai no caminho da URL) |
| `AGENT_TIMEOUT_MS` | `90000` | Limite por resposta do agente, de 1000 a 600000 ms (o agente já levou 54 s) |
| `NODE_ENV` | vazio | `production` = log em JSON; ausente = legível (pino-pretty) |
| `WEB_PORT` | `5173` | Porta do Vite dev server (só o frontend em dev); o proxy `/api` usa `API_PORT` |

Regras (`api/src/config.ts`):

- Variável vazia conta como não definida (o compose repassa vazios).
- O `.env` fica em `portal/.env` e é lido com `process.loadEnvFile()` no `main.ts`, só se existir. Variáveis do ambiente têm prioridade. (Não usamos `node --env-file-if-exists`: com `--watch` e sem `.env`, o Node 24.21 aborta no Ctrl+C.)
- Valor inválido: a API não sobe e lista **todas** as variáveis com problema de uma vez, por exemplo:

  ```
  Configuração inválida:
    - SAMPLE_ORDER_IDS deve ser uma lista de números de pedido separados por vírgula (inteiros positivos de até 10 dígitos) (recebido: "15,x")
    - ORDERS_FILE é obrigatória com DATA_SOURCE=file: caminho do CSV da Silver (não definida)
  ```

- No Docker, `DATA_SOURCE` e `ORDERS_FILE` do `.env` não valem: a fonte é escolhida pelos arquivos de compose (seção 15). `AGENT` fica fixo em `mock` no compose.
- A chave do Gemini nunca entra no `.env` do portal: fica só no `.env` do agente.

## 8. Fontes de dados

### Porta

```ts
interface OrderRepository {
  findById(orderId: number): Promise<Order | null>;
  count(): Promise<number>;
}
```

Os dois adapters montam um `Map<orderId, Order>` e o entregam a `createInMemoryRepository`. A porta é assíncrona para que uma fonte futura (banco ou Parquet) não exija mudar serviço nem rotas.

### `fixtures`

- `orders/fixtures/orders.json`: 11 pedidos reais da Silver, só com os campos do contrato.
- Validados contra `z.array(orderSchema)` ao carregar. Arquivo inválido impede a API de subir, com a mensagem do Zod apontando o campo. Campos fora do contrato são descartados na leitura.

### `file` (Silver em CSV)

`loadFileRepository(file, log)` em `orders/file-repository.ts`, numa passada só:

1. `pipeline(createReadStream(file), parse(...), consumidor)`: streaming, com registros como arrays.
2. O primeiro registro é o cabeçalho. Ele define a posição de cada coluna de `SILVER_COLUMNS` (21 colunas). Se faltar alguma, a carga é interrompida com erro.
3. Cada registro vira uma `SilverRow` **só com essas 21 colunas**. As demais, inclusive as proibidas, são descartadas ali, antes de qualquer agrupamento.
4. Linha curta (coluna faltando) ou com `id_pedido` inválido: contada como inválida e ignorada.
5. Linhas agrupadas por `id_pedido` num `Map`. Os itens de um pedido não precisam estar em linhas seguidas.
6. Cada grupo passa por `mapSilverOrder`, que já valida com `orderSchema`. Pedido inválido é descartado inteiro (todas as suas linhas contam como inválidas), para não exibir pedido com itens faltando. O grupo é apagado do `Map` assim que o pedido é montado.
7. Log de resumo.

Opções do `csv-parse`: `bom: true`, `relax_column_count: true` (linha curta vira inválida em vez de derrubar a carga) e `skip_empty_lines: true`.

#### Log

Até 10 avisos detalhados, depois só a contagem. Os avisos nunca trazem o conteúdo das linhas, só o número do registro, o número do pedido e o nome dos campos:

```json
{"record":16,"reason":"id_pedido inválido","msg":"Linha inválida na Silver; ignorada"}
{"orderId":99001,"rows":2,"fields":["trackingStatus"],"msg":"Pedido inválido na Silver; ignorado"}
{"file":"/data/silver_pedidos_rastreio.csv","orders":65752,"invalidRows":0,"durationMs":10807,"msg":"Pedidos carregados da Silver"}
```

#### Erros fatais (a API não sobe)

| Situação | Mensagem |
|---|---|
| Arquivo inexistente | `Não foi possível ler ORDERS_FILE (<caminho>): arquivo não encontrado.` |
| Caminho é uma pasta | `... o caminho é uma pasta, não um arquivo.` |
| Sem permissão | `... sem permissão de leitura.` |
| Arquivo vazio | `... o arquivo está vazio.` |
| Coluna lida ausente no cabeçalho | `... o cabeçalho não tem as colunas <lista>.` |

#### Desempenho e memória (Silver de 163 MB, 180.519 linhas, medido em 14/11)

| Medida | Local (Node 24.21) | Docker |
|---|---|---|
| Carga | 10,5 a 11,3 s | 10,6 s |
| Até o health responder | 12,2 s | 12,9 s (healthy) |
| Heap retido após a carga | ~47 MB (12 MB de base) | |
| RSS | ~350 MB | ~285 MiB |
| Consulta | ~0,4 ms (2.000 seguidas em 0,84 s, medido com curl) | |

Três escolhas reduziram a memória de 230 MB para 47 MB de heap retido (RSS de 470 para ~350 MB):

- **`Object.fromEntries` para montar cada linha.** Atribuir as 21 chaves uma a uma num loop leva o objeto ao modo dicionário do V8 (~800 B por linha).
- **Apagar cada grupo do `Map` assim que o pedido é montado.** Um heap snapshot mostrou que o closure do `pipeline` mantém vivo o contexto da função depois da carga, e com ele o `Map` de linhas.
- **Pool de textos (`intern`).** Quase tudo se repete na Silver (4 modalidades, 23 regiões, ~118 produtos, ~1.100 datas), então cada texto é guardado uma vez só. O pool é limpo no fim.

O RSS fica acima do heap porque o V8 não devolve ao sistema as páginas usadas no pico da leitura.

O tempo de carga é quase todo da `csv-parse` (perfil de CPU: ~8,4 s de ~11 s). Alternativa medida e não adotada: `papaparse` 5.7.0 lê o arquivo em 1,2 s (modo `step`) ou 3,9 s (stream dentro do `pipeline`), mas não remove o BOM e exige `@types/papaparse` e mais código de tratamento de erro. Vale reconsiderar se o boot de ~10 s atrapalhar.

## 9. Mapeamento Silver → `Order`

Tudo em `orders/silver-mapper.ts`. É o único arquivo que conhece os nomes e formatos da Silver; se o contrato de dados mudar, a mudança se concentra nele.

| Campo | Coluna(s) da Silver | Regra |
|---|---|---|
| `orderId` | `id_pedido` | Chave do agrupamento das linhas (uma por item) |
| `orderDate` | `data_pedido` | 10 primeiros caracteres do texto ISO |
| `shippingMode` | `modo_envio` | Como vem |
| `trackingStatus` | `situacao_rastreio` | Como vem |
| `deadlineStatus` | `status_entrega_pt` | Como vem |
| `delayDays` | `dias_atraso` | Vazio → `null` |
| `delayWindow` | `janela_atraso` | Sem o prefixo de ordenação: `3. Atraso Leve (1 a 2 dias)` → `Atraso Leve (1 a 2 dias)` |
| `estimatedDeliveryDate` | `data_prevista_entrega` | 10 primeiros caracteres |
| `actualDeliveryDate` | `data_envio` | **Só se `situacao_rastreio = Entregue`** (a coluna vem preenchida em todos os pedidos) |
| `origin` | `origem_cliente_cidade`, `_estado`, `_pais` | `Cidade, Estado, País`, sem partes vazias |
| `destination` | `destino_cidade`, `_estado`, `_pais` | Idem |
| `region` | `destino_regiao` | Como vem |
| `market` | `mercado_logistico` | Como vem (em inglês) |
| `items[]` | `nome_produto`, `categoria_produto`, `quantidade_item`, `valor_item_pedido` | Valor líquido do item |
| `total` | soma de `valor_item_pedido` | Somado em centavos inteiros (evita `0.1 + 0.2 = 0.30000000000000004`) |
| `probableCause` | não existe | Sempre `null` |

Os campos do pedido vêm da primeira linha do grupo (na Silver, todos os itens de um pedido têm a mesma situação, datas e rota). Texto vazio em campo numérico vira `NaN` e falha na validação, em vez de virar `0`.

**Armadilha de fuso.** As datas da Silver vêm em UTC (`2015-01-09T01:02:00.000Z`). Com `new Date()`, em UTC-3, as 22.723 linhas com hora antes de 03:00Z cairiam no dia anterior. Por isso o mapper corta o texto e nunca cria `Date`. Os testes rodam com `TZ=America/Sao_Paulo`, e o teste do fuso confere antes que `new Date()` de fato mudaria o dia.

**Colunas proibidas** (`FORBIDDEN_COLUMNS`, nunca lidas): `id_cliente`, `segmento_cliente`, `tipo_pagamento`, `lucro_item`, `margem_lucro_item`, `lucro_total_pedido`, `valor_desconto`, `latitude_origem`, `longitude_origem`, `resumo_rastreio_rag` (o texto cita "Cliente ID").

**Colunas sem uso** (também não lidas): `id_item_pedido`, `id_produto`, `valor_bruto_venda`, `preco_unitario`, `departamento`, `status_pedido`, `dias_envio_programado`, `dias_envio_real`, `flag_atrasado`, `rota_logistica`.

**Verificação completa (14/11):** os 65.752 pedidos produzidos pela API foram comparados com a implementação de referência em Python que gerou os mocks. São idênticos, exceto o `probableCause` do 375: o script de referência fixa "Promessa irreal" nele como exemplo da demo.

## 10. Chat e assistente

Tudo em `api/src/chat/`. A tela manda a pergunta para `POST /api/chat`; a API responde pelo assistente escolhido em `AGENT`. **Sem histórico no servidor:** o ADK guarda a conversa, e o simulado responde cada mensagem sozinho. Sem streaming e sem rate limit nesta fase.

| Arquivo | Papel |
|---|---|
| `routes.ts` | `POST /api/chat`, com o esquema no `/docs` |
| `chat-service.ts` | Pedido de contexto, trava por conversa, log; lança `ChatBusyError` |
| `cited-orders.ts` | `citedOrderIds` e `findCitedOrder`: usados pelo serviço e pelo simulado (uma regra só) |
| `support-agent.ts` | Porta `SupportAgent.reply({ sessionId, message, order }) → string` e os erros do assistente |
| `mock-agent.ts` | Adapter `mock` |
| `adk-agent.ts`, `adk-events.ts` | Adapter `adk` e extração da resposta final |

### 10.1. Pedido de contexto e pedido citado

1. O serviço procura na mensagem sequências de 1 a 10 dígitos maiores que zero (`#375` → 375; `0015` → 15; 11 dígitos ou mais, como telefone, não contam) e consulta cada uma, na ordem, em `OrderService.findOrder`.
2. O primeiro pedido que existe vira o **contexto** e volta em `mentionedOrderId`, para a tela abrir esse pedido.
3. Sem pedido citado, o contexto é o `orderId` aberto na tela, se existir na fonte. Pedido aberto inexistente é ignorado, sem erro.

O adapter recebe o pedido já resolvido (`order: Order | null`).

### 10.2. Uma mensagem por vez por conversa

O serviço guarda as conversas ocupadas num `Set`, conferido e marcado **antes de qualquer `await`** (duas chamadas simultâneas não passam juntas). Outra mensagem da mesma conversa antes da resposta → `ChatBusyError` → `409 CHAT_BUSY`. A conversa é liberada no `finally`, inclusive em falha. Conversas diferentes são atendidas em paralelo. Resposta vazia (só espaços) vira `AgentUnavailableError`.

### 10.3. Assistente simulado (`AGENT=mock`)

`mock-agent.ts` tem as regras e os textos que ficavam na tela, consultando a fonte configurada (funciona com a Silver):

| Pergunta | Resposta |
|---|---|
| Cita pedido inexistente (com a palavra "pedido" ou só o número) | "Não encontrei o pedido **#N**. Confira o número e tente novamente." |
| "modalidade", "tipos de envio", "formas de envio", "classe" | As quatro modalidades e seus prazos |
| "atras", "por que", "motivo", "demor", "causa" | `buildWhyReply`: motivo provável, ou situação sem atraso, cancelado, aguardando liberação |
| "quando", "chega", "prazo", "previs", "entreg", "situac", "status", "onde", ou só o pedido | `buildWhenReply`: situação, datas e dias de atraso |
| Sem pedido de contexto | Pede o número do pedido |
| Fora do escopo | Diz o que sabe fazer |

Regras fixas: rótulo sempre "Motivo provável", nenhum texto apresenta a causa como comprovada, nada sobre pagamento (só "Aguardando Liberação"). O detalhe de "Promessa irreal" é montado a partir do pedido (modalidade, prazo, estado de origem → cidade e país de destino; "rota internacional" só se os países forem diferentes). Outros motivos aparecem sem detalhe.

### 10.4. Adapter do agente ADK (`AGENT=adk`)

Pela API nativa do ADK (`agent/docs/api-chat.md`); não existe `/chat` no agente. Só `fetch` nativo.

| Etapa | Comportamento |
|---|---|
| Identidade | `userId = portal-<sessionId>`, gerado no servidor, nunca vindo do navegador |
| Criar a sessão | `POST /apps/{AGENT_APP_NAME}/users/{userId}/sessions/{sessionId}` com `{}` na **primeira** mensagem de cada `sessionId`. `409` "already exists" conta como sucesso |
| Memória de sessões | `Map` em ordem de uso: esquece as com mais de 2 h sem uso e, acima de 1.000, as usadas há mais tempo. Se a conversa voltar, a criação devolve `409` e segue normal |
| Mensagem | `POST /run` com `{ appName, userId, sessionId, newMessage: { role: "user", parts: [{ text }] } }` |
| Sessão perdida | `404` com `detail` "Session not found" (o agente reiniciou; as sessões ficam em memória): recria a sessão e reenvia **uma vez**. Seguro porque a mensagem comprovadamente não foi processada. Outro `404` vira `502` sem reenvio |
| Limite de tempo | Um `AbortSignal.timeout(AGENT_TIMEOUT_MS)` por resposta, cobrindo criação da sessão, `/run` e o eventual reenvio → `AgentTimeoutError` (`504`) |
| Falhas | HTTP não-2xx (sem chave, cota, "high demand" do Gemini: o `/run` responde `500`), JSON inválido, conexão recusada ou sem resposta final → `AgentUnavailableError` (`502`) |
| Reenvio | Nenhum outro reenvio automático, nem na API nem na tela |

**`extractFinalText(events)`** (`adk-events.ts`) reproduz `extract_final_text` (`agent/src/translog/client.py`) e todos os casos de teste dele: recusa evento com `errorCode`/`error_code`; o último evento com conteúdo precisa ser do `model`, sem `partial`/`interrupted` e sem chamada ou retorno de ferramenta; junta as partes de texto que não são `thought`; nunca recupera um texto intermediário anterior. "Verdadeiro" segue o Python (`null`, `0`, `""`, `[]`, `{}` são falsos). Única diferença: também recusa `function_response` (snake_case), o que só deixa a regra mais estrita.

**`withOrderContext(message, order)`** coloca o pedido de contexto dentro do texto, porque o agente não recebe o número em campo separado: `[Pedido aberto no portal: 375] Quando chega?`. **Formato provisório**, a combinar com o Marco; é o único ponto do portal que o conhece.

Motivos técnicos (campo `reason` do log): `HTTP <status> em POST /run`, `HTTP <status> ao criar sessão`, `sem resposta do agente em <ms> ms (...)`, `falha de conexão com o agente (..., ECONNREFUSED)`, `JSON inválido na resposta do agente (...)` e os da extração (com o `errorCode`, nunca o `errorMessage`). Nunca o corpo HTTP: o `422` do FastAPI ecoa a entrada.

### 10.5. Log sem conteúdo

Uma linha por mensagem, sem o texto do cliente nem a resposta:

```
INFO: Mensagem do chat respondida
    agent: "adk"
    sessionId: "8cf6b792-104c-4df5-928e-9a1feea95461"
    messageLength: 30
    outcome: "ok"
    durationMs: 16998
```

`outcome`: `ok` (info), `busy` (info), `unavailable`, `timeout` ou `error` (warn, com `reason` técnico). O reenvio após sessão perdida registra `Sessão perdida no agente (reiniciou?); recriando e reenviando`, só com a sessão. O log padrão de requisição do Fastify registra método e URL, nunca o corpo.

### 10.6. Na tela

O pedido aberto vai em `orderId`; `mentionedOrderId` abre o pedido citado; "digitando…" enquanto espera, sem tempo artificial; falha vira "Não enviada · Tentar novamente" (no `504`, "O assistente demorou demais"), com reenvio só manual. Detalhes na seção 13.6.

### 10.7. Verificação com o agente real (15/11)

Pela tela, contra o agente local do Marco (Docker, lendo a mesma Silver do portal; modelo `gemini-3.5-flash`), com a API em `fixtures`:

| Passo | Simulado | Agente ADK |
|---|---|---|
| 375 → "Perguntar ao assistente" | 0,2 s | 17,3 s |
| "E o pedido 15, já chegou?" (abre o 15 no rastreio) | 0,2 s | 11,5 s |
| "Nova conversa" → "Quando chega?" (sessão nova, contexto do 15 pelo prefixo) | 0,3 s | 13,7 s |

O agente não repetiu o prefixo ao cliente. As respostas dele vieram longas, item a item, com termos técnicos (`actual_days`, "Item ID"), sem motivo provável (a Silver não tem a coluna, enquanto a tela em `fixtures` mostra "Promessa irreal" no 375) e com alguns símbolos que a tela não formata (`---`, `*Nota:*`, crases). O log da API trouxe só os metadados acima.

### 10.8. O que depende do Marco

Isolado em `withOrderContext` e na configuração `AGENT*`; o resto do chat não muda:

- formato do pedido de contexto no texto (e instruir o agente a não repeti-lo);
- tamanho, tom e formatação das respostas; motivo provável; modelo e velocidade;
- se o ADK continua processando depois de um `504` (o "Tentar novamente" pode sobrepor duas mensagens na mesma sessão);
- Dockerfile do agente na `main` para entrar no compose;
- base de pedidos do agente igual à do portal (depende também da Gold).

## 11. Privacidade em camadas

Regra do projeto: nenhuma resposta traz dados do cliente, de pagamento ou financeiros internos.

1. **Leitura por lista de permitidas.** O adapter `file` copia só `SILVER_COLUMNS`. As colunas proibidas não chegam a nenhuma estrutura da aplicação.
2. **Contrato sem campos sensíveis.** `orderSchema` não tem esses campos. Os `fixtures` passam por ele ao carregar, o que descarta qualquer extra.
3. **Serialização pelo contrato.** O serializer do `fastify-type-provider-zod` passa a resposta por `safeEncode` do Zod, que descarta chaves fora do esquema, inclusive dentro de `items`.
4. **Testes** (`privacy.test.ts`):
   - varre todas as chaves, em qualquer nível, de todas as respostas (sucesso, erros, `/docs/json`), nas duas fontes;
   - confere que nenhuma resposta contém os valores fictícios das colunas proibidas (`FICTICIO-*`) e sem uso (`SEM-USO`) da amostra;
   - usa um repositório que devolve `id_cliente`, `lucro_item` etc. para provar a camada 3.
5. **Logs sem conteúdo.** Linhas e pedidos inválidos são logados só com número do registro, número do pedido e o nome dos campos. O chat registra só sessão, tamanho, modo, tempo e resultado (seção 10.5). Erros 4xx registram só `statusCode` e `code`: a mensagem de JSON malformado do Node traz um trecho do corpo enviado.
6. **Chat.** A resposta passa por `chatResponseSchema` (só `sessionId`, `reply`, `mentionedOrderId`). O simulado monta o texto só com campos do `Order`. `privacy.test.ts` pergunta ao simulado sobre todos os pedidos, nas duas fontes e com um repositório que devolve campos proibidos, e confere chaves, valores fictícios e palavras proibidas no texto (cliente, pagamento, lucro, margem, desconto, latitude...). **Limite:** com `AGENT=adk`, o texto é produzido pelo agente a partir da base que ele lê; o portal não filtra esse texto. A privacidade depende do agente ler só colunas permitidas (pendência com o Marco).
7. **Silver fora do Git e da imagem.** `portal/dados/` está no `.gitignore` da raiz; o `.dockerignore` tira `dados/` e qualquer `*.csv`. No Docker, a Silver entra por volume somente leitura.

## 12. Tratamento de erros

Tudo em `http/errors.ts`. Rotas e serviços não têm `try/catch` para montar resposta.

| Origem | Status | `code` | `message` |
|---|---|---|---|
| `OrderNotFoundError` (serviço) | 404 | `ORDER_NOT_FOUND` | Pedido não encontrado. Confira o número e tente novamente. |
| `ChatBusyError` (chat) | 409 | `CHAT_BUSY` | Aguarde a resposta anterior antes de enviar outra mensagem. |
| `AgentUnavailableError` (assistente) | 502 | `AGENT_UNAVAILABLE` | O assistente está indisponível no momento. Tente novamente em instantes. |
| `AgentTimeoutError` (assistente) | 504 | `AGENT_TIMEOUT` | O assistente demorou demais para responder. Tente novamente. |
| Validação Zod (params, corpo) | 400 | `VALIDATION_ERROR` | `Requisição inválida: <campo>: <motivo>.` |
| JSON malformado | 400 | `VALIDATION_ERROR` | Requisição inválida. |
| Outros 4xx do Fastify | mesmo status | `BAD_REQUEST` | Mensagem genérica por status (ex.: 415 "Tipo de conteúdo não suportado.") |
| Rota inexistente | 404 | `NOT_FOUND` | Recurso não encontrado. |
| Qualquer outro erro | 500 | `INTERNAL_ERROR` | Ocorreu um erro inesperado. Tente novamente. (detalhe só no log) |

O motivo técnico dos erros do assistente vai só para o log (seção 10.5), nunca para a resposta. Nos demais 4xx, o log registra só `statusCode` e `code`.

As mensagens de validação do Zod saem em pt-BR (`z.config(z.locales.ptBR())` no `server.ts`); um esquema pode trazer mensagem própria, como a do `orderId`.

## 13. Frontend (`@translog/web`)

A interface web foi construída em React 19 + Vite 8 + Tailwind CSS v4 implementando fielmente o protótipo **Direção D** (`portal/prototipos/translog-prototipo-direcao-d.html`).

### 13.1. Identidade visual e Design System (`src/index.css`)

- **Tipografia técnica dupla:**
  - `Inter Variable` (`--font-sans`, via `@fontsource-variable/inter`) para leitura fluida de títulos, rótulos principais e mensagens do assistente;
  - `IBM Plex Mono` (`--font-mono`) para códigos de manifesto (`TL-000375-LATAM`), datas, contagens de dias, preços em dólar e cabeçalhos rotulados (`.label-mono`).
  - Números tabulares forçados com `.tabular { font-variant-numeric: tabular-nums; }` para evitar deslocamento horizontal ao alternar pedidos.
- **Paleta, contraste e interatividade (`@theme inline` + `@layer base`):**
  - Azul-petróleo `#0F4C81` (`--color-primary`) como cor primária de autoridade e foco;
  - Âmbar `#F59E0B` (`--color-accent`) reservado exclusivamente para atenção ("Motivo provável" e "Aguardando Liberação");
  - Vermelho (`red-600` / `red-700` / `red-50`) exclusivo para atrasos reais (`deadlineStatus === "Atrasado"`): etiqueta de prazo, célula de dias de atraso, fita superior do manifesto e destaque da etapa em atraso na linha do tempo;
  - Verde (`emerald-700` / `emerald-50`) para pedidos entregues no prazo ou adiantados;
  - Neutros `slate` (apenas tema claro);
  - Regras em `@layer base` corrigem o cursor padrão de botões do Tailwind v4 (`cursor: pointer` em botões ativos) e padronizam `:focus-visible`.
- **Detalhes gráficos de manifesto internacional:**
  - `.perf-t`: divisor horizontal com serrilhado de manifesto logístico no rodapé de total da fatura;
  - `.route-line`: conector horizontal tracejado ligando origem e destino no cabeçalho da rota;
  - Fita superior semântica de `3px` no `OrderManifestCard` e botão copiável no código de guia (`TL-000375-LATAM`).

### 13.2. Layout, estrutura de tela e ergonomia (`src/app.tsx`)

- **Desktop-first (`min-w-[1280px]`):**
  - **Cabeçalho (`AppHeader`, `h-16`):** marca TransLog (`International Logistics · Rastreamento de pedidos`), fita institucional e indicador de conexão que reflete `GET /api/health` (`Conectado` ou `Sem conexão`).
  - **Coluna esquerda (`TrackingPanel`, `flex-1`):**
    - `OrderSearchForm`: aceita apenas dígitos (1 a 10), oferece pílulas rápidas vindas de `GET /api/orders/samples`, atalho global de teclado `/` para focar a busca, botão `X` para limpar e retornar ao estado inicial, e indicador de carregamento (`Consultando`) no submit;
    - Estados dedicados (`tracking-states.tsx`): tela inicial com resumo em 3 blocos (`01 · Situação e prazo`, `02 · Motivo provável`, `03 · Rota e manifesto`), skeleton animado, pedido não encontrado com botão *"Tentar outro número"* e erro de rede com retentativa;
    - `OrderManifestCard`: grade de 4 colunas (`Previsão/Entrega`, `Cumprimento do prazo`, `Modalidade contratada`, `Pedido realizado em` com contagem de itens e total em `US$`), alerta de motivo provável com CTA *"Perguntar ao assistente"* e bloco integrado de rota (com truncamento seguro para cidades longas) + linha do tempo;
    - `OrderItemsTable`: exibe itens, categorias, quantidades e soma distinta de itens e unidades totais no cabeçalho.
  - **Coluna direita (`ChatPanel`, `w-[400px]` fixa na altura da viewport):** assistente TransLog com indicador de conexão no avatar, faixa de contexto do pedido ativo (`Falando sobre o pedido #375` ou `Nenhum pedido selecionado`), botão *"Nova conversa"* desabilitado quando o chat está vazio, sugestões contextuais e caixa de envio (`Enter` envia, `Shift+Enter` quebra linha).

### 13.3. Cliente HTTP, validação Zod e cache (`src/api/`)

- **`client.ts`:**
  - Toda chamada HTTP passa por `getJson(path, schema)` ou `postJson(path, body, schema)`, que usam a mesma função (`requestJson`).
  - Se o `fetch` falhar na rede (`TypeError`), lança `ApiError` com `status: 0` e `code: "NETWORK_ERROR"`, ativando automaticamente o card de **Sem conexão com o servidor** na tela.
  - Se a resposta não for `2xx`, tenta decodificar o envelope `errorResponseSchema` (`@translog/contracts`) para preservar `code` (`ORDER_NOT_FOUND`, `VALIDATION_ERROR`, etc.) e `message` vindos do Fastify.
  - Se for `200 OK`, valida o corpo com `schema.safeParse(body)` usando o próprio esquema Zod de `@translog/contracts` (`orderSchema`, `orderSamplesResponseSchema`, `healthResponseSchema`, `chatResponseSchema`). Respostas fora do contrato lançam `INVALID_RESPONSE`.
- **`queries.ts` (`@tanstack/react-query`):**
  - `useHealth()`: consulta `/api/health` com `staleTime: 30_000`.
  - `useOrderSamples()`: consulta `/api/orders/samples` e usa fallback `[15, 375, 562, 1002]` caso a API ainda não tenha respondido.
  - `useOrderQuery(orderId)`: consulta `/api/orders/:orderId` apenas quando `orderId !== null`.
  - `useSendChatMessage()`: `useMutation` de `POST /api/chat` com `retry: false` (o agente pode já ter processado a mensagem; reenvio só manual).
  - `shouldRetry(failureCount, error)`: política testada unitariamente que **nunca repete erros 4xx** (`404 ORDER_NOT_FOUND` ou `400 VALIDATION_ERROR` falham na hora) e faz **1 retentativa rápida** em erros de rede (`status: 0`) ou `5xx`.

### 13.4. Formatação segura de datas e valores (`src/lib/format.ts`)

- **`formatDate(isoDate)`:** converte `"2015-01-08"` em `"08/01/2015"` operando exclusivamente por regex e corte de string (`/^(\d{4})-(\d{2})-(\d{2})/`), **sem jamais instanciar `new Date()`**. Isso garante que o frontend preserve a mesma regra de calendário do backend em qualquer fuso horário do navegador.
- **`formatCurrency(value)`:** usa `Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" })` para produzir `US$ 91,34`.
- **`formatManifestCode(order)`:** gera o código de etiqueta internacional no formato `TL-<ORDER_ID_6_DIGITOS>-<MARKET>` (ex.: `TL-000375-LATAM`, `TL-020322-PACIFICASIA`).

### 13.5. Máquina de estados da linha do tempo (`src/features/tracking/timeline.ts`)

`buildTimelineSteps(order, releaseLabel)` recebe um `Order` e a variante de rótulo (`"waiting"` ou `"payment"`) e devolve os dados das etapas sem efeitos colaterais, mantendo a apresentação visual (conectores e destaque vermelho em atraso) no `OrderManifestCard`:

| Situação (`trackingStatus`) | Etapa 1 | Etapa 2 | Etapa 3 | Etapa 4 |
|---|---|---|---|---|
| **Aguardando Liberação** | Pedido realizado (`done`, `orderDate`) | Pedido liberado / Confirmação pendente (`current`, âmbar, `Etapa atual`) | Em trânsito (`pending`) | Entregue (`pending`, `previsto DD/MM/AAAA`) |
| **Em Trânsito** (no prazo) | Pedido realizado (`done`, `orderDate`) | Pedido liberado (`done`) | Em trânsito (`current`, azul, `Etapa atual`) | Entregue (`pending`, `previsto DD/MM/AAAA`) |
| **Em Trânsito** (atrasado) | Pedido realizado (`done`, `orderDate`) | Pedido liberado (`done`) | Em trânsito (`current`, **vermelho**, `Em atraso (+Nd)`) | Entregue (`pending`, `previsto DD/MM/AAAA`) |
| **Entregue** | Pedido realizado (`done`, `orderDate`) | Pedido liberado (`done`) | Em trânsito (`done`) | Entregue (`done`, `actualDeliveryDate` + `(+Nd)` em vermelho se atrasado) |
| **Cancelado** | Pedido realizado (`done`, `orderDate`) | — | — | Banner neutro *"Este pedido foi cancelado."* |

### 13.6. Chat ligado à API (`src/features/chat/`)

A tela não tem mais regra de respostas: tudo vem de `POST /api/chat` (a regra do simulado vive só em `api/src/chat/mock-agent.ts`).

- **Envio (`app.tsx`):** a pergunta entra na conversa, o "digitando…" aparece (sem tempo artificial) e `useSendChatMessage` envia `{ sessionId, message, orderId }`, com o `orderId` do pedido exibido (o mesmo do chip "Falando sobre o pedido"). Enquanto espera, a caixa de texto fica bloqueada.
- **`sessionId` por conversa (`chat-session.ts`):** criado na primeira mensagem (`createSessionId`, UUID v4). Volta a vazio (conversa nova) em "Nova conversa", na troca de pedido com "Zerar" (`startsNewConversation`) e ao aplicar uma conversa de exemplo da barra. A resposta que chega depois de a conversa mudar é descartada.
- **Pedido citado:** `mentionedOrderId` diferente do pedido aberto abre esse pedido pela mesma função do formulário (`handleSelectOrder`), aplicando a regra de troca do chat.
- **Falha:** a pergunta fica "Não enviada · Tentar novamente"; no `504`, "O assistente demorou demais · Tentar novamente" (`chatFailureLabel`). Reenvio só manual. Com a rede simulada desligada na barra (`n=off`), a mensagem falha na hora, sem chamar a API.
- **Formatação (`rich-text.ts`):** `parseRichText` transforma o texto em linhas (texto, título `#`/`##`/`###`, item de lista `*`/`-`/`•` com até 2 níveis, linha em branco) com trechos em `**negrito**`; `chat-messages.tsx` monta os elementos React, sem `dangerouslySetInnerHTML`. Tabelas, links, `---`, `*itálico*` e crases aparecem como texto.
- **Sugestões (`chat-suggestions.ts`):** com a conversa vazia, 3 perguntas adaptadas ao pedido aberto; sempre citam o número do pedido.
- **Limite:** a caixa de texto aceita até `CHAT_MESSAGE_MAX_LENGTH` (1000) caracteres. `Enter` envia, `Shift+Enter` quebra linha.
- **Três modos ao trocar de pedido (`chatOnSwitch`, decisão em aberto):** `keep` (padrão) mantém a conversa; `divider` insere `Alternado para o pedido #N`; `clear` limpa a conversa e começa outra no backend.

### 13.7. Estado na URL e Barra de Apresentação (`src/lib/url-state.ts` e `ProtoBar`)

- **URL limpa por padrão:** ao abrir `http://localhost:5173`, a URL permanece limpa (`/`) e a tela abre no estado inicial vazio. Ao buscar um pedido, apenas `?pedido=<id>` é gravado via `window.history.replaceState` (se for o pedido padrão ou se limpar a busca, o parâmetro é removido).
- **Presets de demonstração por query string:** para testes ou apresentações guiadas, a URL também lê opcionalmente:
  - `?pedido=375` (ou `?order=375`): abre direto o pedido informado;
  - `?t=empty|loading|notfound|neterr|375`: força um estado de rastreamento;
  - `?c=conversation|typing|error|empty`: conversa de exemplo com textos fixos sobre o 375 (abre o 375 se nenhum pedido for informado);
  - `?s=keep|divider|clear`: escolhe o comportamento do chat ao trocar de pedido;
  - `?r=waiting|payment`: alterna o rótulo de `"Aguardando liberação"` vs `"Pagamento pendente"`;
  - `?n=on|off`: simula a rede ligada ou desligada;
  - `?bar=off`: oculta completamente a barra inferior.
- **Barra de demonstração (`ProtoBar`):** barra recolhível que permite testar ao vivo todos os estados de tela, alternar as 2 decisões de produto em aberto com o time e recolher a barra durante a apresentação para a banca. As conversas de exemplo (`Conversa`, `Digitando`, `Erro`) usam textos fixos de `dev-bar/chat-presets.ts`, abrem o 375 e começam uma conversa nova; o "Digitando" de exemplo não envia nada à API.

## 14. Testes

```bash
pnpm test                         # todos os 254 testes (~15 s com a Silver presente)
pnpm --filter @translog/api test  # só a API (209 testes + 1 de integração desligado)
pnpm --filter @translog/web test  # só o frontend (45 testes, ~1 s)
```

### Testes do Backend (`@translog/api` — 209 testes)

| Arquivo | Cobre |
|---|---|
| `config.test.ts` | Padrões, vazios, cada variável inválida (inclusive `AGENT*`), `ORDERS_FILE` relativo, barra final de `AGENT_URL`, lista de erros completa |
| `server.test.ts` | Health (fixtures, file, arquivo ausente, modo do agente), formato de todos os erros, OpenAPI e Swagger UI |
| `chat/chat-service.test.ts` | Pedido citado existente e inexistente, primeiro número existente, pedido aberto inexistente ignorado, trava (mesma conversa → `ChatBusyError`; liberada depois de resposta e de falha; conversas diferentes em paralelo), resposta vazia, log sem conteúdo |
| `chat/mock-agent.test.ts` | 375 "por que atrasou" e "quando chega", modalidades, sem pedido, fora do escopo, pedido inexistente, cada situação, "Promessa irreal" em rota nacional e Same Day, nenhuma causa comprovada nem pagamento |
| `chat/routes.test.ts` | `200`, `400` (sem `sessionId`, UUID inválido, mensagem vazia, só espaços, 1001 caracteres, `orderId` inválido), mensagem aparada, `409`, `502`, `504` sem vazar detalhe, OpenAPI com exemplo |
| `chat/adk-events.test.ts` | Todos os casos de teste de `extract_final_text` + formatos inesperados, `error_code`, `function_call`/`function_response` |
| `chat/adk-agent.test.ts` | Contra um servidor HTTP falso: sessão criada só na 1ª mensagem com `userId` do servidor, `409` na criação = ok, `404` → recria e reenvia uma vez (e só uma), `500` → `502`, timeout → `504`, sem resposta final, `errorCode`, JSON inválido, conexão recusada, contexto do pedido no texto, expiração e limite do `Map`, rota com `AGENT=adk`. Integração com o agente real só com `AGENT_IT_URL` |
| `orders/routes.test.ts` | 200 (os 11 fixtures sem alteração), 404, 400 (8 formatos), zeros à esquerda, samples, parâmetro no OpenAPI |
| `orders/fixtures-repository.test.ts` | Carga, quatro situações da demo, arquivo inválido, campos extras descartados |
| `orders/silver-mapper.test.ts` | Pedido 375 completo, fuso, entrega por situação, `delayDays`, prefixo da janela, centavos, rota, 11 casos inválidos, colunas proibidas fora da lista lida |
| `orders/file-repository.test.ts` | Amostra igual aos mocks, log, descarte de colunas, linhas inválidas sem conteúdo no log, limite de avisos, itens fora de sequência, BOM, erros fatais; **integração com a Silver real** |
| `privacy.test.ts` | Seção 11 (pedidos e chat) |

### Testes do Frontend (`@translog/web` — 45 testes)

| Arquivo | Cobre |
|---|---|
| `lib/format.test.ts` | Formatação `AAAA-MM-DD` → `DD/MM/AAAA` sem `new Date()`, moeda `US$` em `pt-BR`, código de manifesto (`TL-000375-LATAM`) e pluralização de dias |
| `lib/url-state.test.ts` | Leitura de `?pedido=375`, rejeição de IDs inválidos (`0`, `abc`), presets da `ProtoBar` e atualização limpa da query string |
| `api/client.test.ts` | `shouldRetry`, `ApiError`, `postJson` (corpo enviado, `409`/`502`/`504`, resposta fora do contrato) |
| `features/tracking/timeline.test.ts` | Máquina de estados das 4 etapas em todas as situações (`Entregue`, `Em Trânsito`, `Aguardando Liberação` com variantes `waiting`/`payment`, e `Cancelado`) |
| `features/chat/chat-session.test.ts` | `sessionId` aceito pelo contrato, conversa nova só com "Zerar", efeito da troca de pedido nas mensagens, texto de falha por status |
| `features/chat/chat-suggestions.test.ts` | Sugestões por situação do pedido, sempre citando o número |
| `features/chat/rich-text.test.ts` | Negrito, listas (`*`, `-`, `•`, subníveis), títulos, linha em branco, asteriscos soltos |
| `features/dev-bar/chat-presets.test.ts` | Conversas de exemplo da barra |

**Fixtures de teste da API**

- `orders/fixtures/orders.json`: os 11 pedidos no formato `Order`.
- `orders/fixtures/silver-amostra.csv`: 15 linhas reais da Silver (pedidos 15, 375, 552, 562, 1002) com as 41 colunas. Valores reais só nas 21 colunas lidas; as proibidas têm `FICTICIO-<coluna>-<n>` e as sem uso, `SEM-USO`. O 552 está lá porque tem hora antes de 03:00Z (teste do fuso).

**Integração com a Silver real:** roda só se `portal/dados/silver_pedidos_rastreio.csv` existir (`describe.skipIf`). Confere 65.752 pedidos, 0 linhas inválidas e os 11 pedidos dos mocks. Com uma Silver nova, o número esperado precisa ser atualizado.

**Configuração do Vitest:** `isolate: false` (os testes não compartilham estado global) e `TZ=America/Sao_Paulo`. Rotas são testadas com `app.inject` (sem abrir porta). `buildServer(config, { logger: false, overrides })` aceita `overrides.orderRepository` e `overrides.supportAgent` para injetar um repositório ou um assistente (que demora ou falha) nos testes. **Nenhum teste automatizado chama o Gemini.**

## 15. Docker

### Imagem (`api/Dockerfile`, contexto `portal/`)

| Estágio | O que faz |
|---|---|
| `base` | `node:24.22.3-alpine3.24` + `corepack enable` |
| `deps` | `pnpm install --frozen-lockfile --prod --filter "@translog/api..."`, com cache do store do pnpm |
| `runtime` | Copia `node_modules`, `api/src` e `contracts/src`; `NODE_ENV=production`; usuário `node`; `CMD node api/src/main.ts` |

O layout do workspace é mantido na imagem de propósito: o Node não remove tipos de arquivos dentro de `node_modules`, e `@translog/contracts` é um symlink para `contracts/`. A imagem final tem 293 MB, sem testes, CSV, `.env` nem dependências de desenvolvimento. O `.dockerignore` tira também `_contexto/`, `dados/` e `prototipos/`, e o contexto de build fica em ~1 kB.

### Compose

| Arquivo | Conteúdo |
|---|---|
| `docker-compose.yml` | Serviço `api` com `DATA_SOURCE=fixtures`, `AGENT=mock`, porta `${API_PORT:-3333}`, healthcheck em `/api/health` (`start_period: 60s`, `start_interval: 1s`) |
| `docker-compose.silver.yml` | Sobreposição: `DATA_SOURCE=file`, `ORDERS_FILE=/data/silver_pedidos_rastreio.csv`, volume `./dados:/data:ro` |

**Chat no Docker sempre simulado:** o agente do Marco ainda não tem imagem na `main`, e, dentro do container da API, `AGENT_URL=http://127.0.0.1:8001` apontaria para o próprio container, não para a máquina. Quando o Dockerfile do agente estiver na `main`, ele entra como serviço no compose e a API usa `AGENT_URL=http://agent:8001`. Para testar com o agente, use `pnpm dev`.

**Por que dois arquivos:** com o volume no `docker-compose.yml`, o Docker cria `portal/dados/` **como root** no host quando a pasta não existe (testado em 14/11). Em um clone novo no Linux, copiar a Silver para lá passaria a exigir `sudo`. A sobreposição só monta o volume quando a Silver é usada.

## 16. Como fazer mudanças comuns

**A Silver mudou (coluna renomeada, nova ou removida)**
1. `orders/silver-mapper.ts`: ajustar `SILVER_COLUMNS` e `mapSilverOrder`.
2. Regenerar `orders/fixtures/silver-amostra.csv` com o cabeçalho novo, mantendo valores fictícios fora das colunas lidas.
3. Atualizar os testes do mapper e, se mudar o número de pedidos, o teste de integração.

**Campo novo no `Order`** (ex.: `probableCause` passa a vir da base)
1. `contracts/src/orders.ts`: campo com `.describe()` em pt-BR.
2. `silver-mapper.ts`: preencher o campo.
3. `orders/fixtures/orders.json` e `web/src/api/fixtures.ts`: incluir o campo nos 11 pedidos.
4. Testes: `routes.test.ts` compara o pedido 15 campo a campo; ajustar.
5. Conferir se o campo não é sensível (seção 11).

**Mudar como o pedido aberto chega ao agente** (acordo com o Marco)
1. `api/src/chat/adk-agent.ts`: só `withOrderContext`.
2. Ajustar o teste "o texto enviado ao /run leva o contexto do pedido" em `adk-agent.test.ts`.

**Assistente novo** (ex.: outro agente)
1. Adapter em `api/src/chat/` que implementa `SupportAgent` e lança `AgentUnavailableError`/`AgentTimeoutError`.
2. Valor novo em `agentModeSchema` (`contracts/src/chat.ts`), variáveis em `config.ts` e `.env.example`.
3. Novo `case` em `createSupportAgent` (`container.ts`). Serviço, rota e tela não mudam.

**Fonte de dados nova** (ex.: Gold em Parquet)
1. Novo adapter em `orders/` que devolve um `OrderRepository`.
2. Novo valor em `dataSourceSchema` (`contracts/src/health.ts`) e variáveis em `config.ts` e `.env.example`.
3. Novo `case` em `createOrderRepository` (`container.ts`). Serviço e rotas não mudam.

**Rota ou módulo novo na API** (o chat foi feito assim)
1. Pasta própria em `api/src/` (`chat/`), com `routes.ts`, serviço e porta.
2. Esquemas em `contracts/src/` e reexportação no `index.ts`.
3. Registro no `server.ts` e composição no `container.ts`.
4. Erros de domínio novos: classe no módulo e mapeamento em `http/errors.ts`.

## 17. Convenções

- Código, identificadores, arquivos e rotas em inglês. Mensagens da API, interface da tela, documentação e commits em pt-BR.
- Valores de dados como vêm da base, sem tradução (`Em Trânsito`, `Standard Class`, `LATAM`).
- TypeScript `strict`, sem `any` (Biome com `noExplicitAny: error`). Imports relativos com extensão `.ts`/`.tsx`; sem `enum` e `namespace`.
- Versões exatas (`savePrefix: ""`); versões compartilhadas no `catalog` do `pnpm-workspace.yaml`. O pnpm 12 só aceita versões publicadas há pelo menos 1 dia (`minimumReleaseAge`).
- Commits: `tipo(portal): descrição` (`feat`, `fix`, `test`, `docs`, `chore`). Comandos git só pelo responsável pelo portal.
- Antes de commitar: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Nada de abstração especulativa: só o que a fase atual usa.

## 18. Decisões técnicas

| Decisão | Motivo |
|---|---|
| Node 24 executando TypeScript na API, sem build | Dispensa `tsx`, bundler e `dist/` no backend |
| A API devolve o view model `Order` pronto | A conversão Silver → `Order` fica num arquivo só (`silver-mapper.ts`); a tela só exibe |
| Validação Zod também no cliente (`web/src/api/client.ts`) | Garante em tempo de execução que qualquer resposta recebida pela SPA respeita `@translog/contracts` |
| Formatação de datas por corte de texto na API e no Web | Evita `new Date(string)`, que em UTC-3 deslocaria 22.723 linhas da Silver para o dia anterior |
| Máquina de estados pura para a linha do tempo (`timeline.ts`) | Separa a regra das 4 etapas e das variantes (`Cancelado`, `releaseLabel`) do JSX, permitindo testes unitários diretos |
| Carga completa antes do `listen` | Health honesto sem estado "carregando"; consulta O(1) em memória |
| Erros de domínio mapeados só em `http/errors.ts` | Status e mensagens num lugar; rotas sem `try/catch` |
| `orderId` como texto de 1 a 10 dígitos | Mesma regra do campo da tela; recusa `1e3` e `0x1F`, que `Number()` aceitaria |
| `ORDERS_FILE` relativo a `portal/` | O diretório de execução muda entre `pnpm dev`, `pnpm start` e testes |
| `csv-parse` com registros como arrays | ~30% mais rápido que objetos; o descarte das colunas é o mesmo |
| `Object.fromEntries`, grupos liberados e pool de textos | Memória da carga de 230 para 47 MB de heap (seção 8) |
| Docker em dois arquivos de compose | Evita a pasta `dados/` criada como root em clones novos |
| `probableCause` sempre `null` vindo da Silver | A coluna não existe; nada de regra inventada no backend |
| Chat sem histórico no servidor; porta `SupportAgent` recebe o pedido já resolvido | O ADK guarda a conversa; o simulado responde cada mensagem sozinho |
| Pedido citado detectado pelo portal, não pelo agente | Funciona nos dois modos e não depende do formato da resposta do agente |
| Trava por conversa marcada antes de qualquer `await` | O ADK exige uma mensagem por vez por sessão; `409 CHAT_BUSY` em vez de fila |
| Um limite de tempo por resposta (`AGENT_TIMEOUT_MS`, 90 s) | É o tempo que o cliente espera; cobre criação da sessão, `/run` e o reenvio após `404` |
| Reenvio automático só após `404` "Session not found" | Única situação em que a mensagem comprovadamente não foi processada |
| `withOrderContext` como único ponto que conhece o formato do contexto | O formato ainda depende do Marco |
| Regra do simulado só no backend | Uma cópia só; funciona com a Silver, não só com os 11 de exemplo |
| Log do chat sem conteúdo | Só metadados; o motivo técnico é montado pelo adapter, sem corpo HTTP |
| Chat no Docker sempre `mock` | O agente ainda não tem imagem na `main`; `127.0.0.1` no container é o próprio container |
| URL limpa por padrão no frontend (`/` sem query string inicial) | Evita poluir a barra de endereços ao abrir o portal; grava `?pedido=` apenas quando o cliente consulta um pedido |

## 19. Limitações e próximos passos

- **Motivo provável na Silver:** com `DATA_SOURCE=file`, nenhum pedido tem `probableCause` (só os `fixtures` têm os motivos preenchidos, como `"Promessa irreal"` no pedido 375). Depende do Mateus e do Marcelo; quando a coluna existir, a mudança é apenas em `silver-mapper.ts`.
- **Agente ADK (pendências com o Marco, seção 10.8):** formato do pedido no texto, respostas longas e técnicas, formatação, sobreposição de mensagens depois de um `504`, Dockerfile na `main`. A tela e a API já funcionam com o agente; só `withOrderContext` e a configuração dependem dele.
- **Tela x chat no motivo provável:** com `AGENT=adk`, o agente lê a Silver (sem motivo provável), enquanto a tela em `fixtures` mostra "Promessa irreal" no 375. Some quando o motivo provável existir na base (Mateus e Marcelo) e o agente e o portal lerem a mesma fonte.
- **Duas decisões de produto em aberto (simuláveis na `ProtoBar`):**
  1. Comportamento do chat ao trocar de pedido (`divider` vs `keep` vs `clear`);
  2. Rótulo de pedidos com pagamento pendente (`Aguardando liberação` vs `Pagamento pendente`).
- **Docker do Frontend (Fase 4):** adicionar Dockerfile multi-stage de `@translog/web` (ou servir o `web/dist` pelo Fastify/Nginx) no `docker-compose.yml` para entrega final containerizada.
- **Fonte final:** Silver ou Gold (possivelmente Parquet) ainda não definida pelo grupo. Para Parquet, avaliar DuckDB no mesmo adapter. Sem banco de dados até o grupo decidir.
