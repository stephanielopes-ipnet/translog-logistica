# Portal TransLog: documentação técnica (Backend e Frontend)

Para quem vai rodar, revisar ou mudar o código do portal. A visão geral, sem detalhes técnicos, está no [README](../README.md).

Estado em 16/11/2026: fundação, contrato `@translog/contracts`, API de pedidos e de chat `@translog/api` e interface `@translog/web` (Direção D) concluídas. **Em 16/11 a fonte passou a ser a das tabelas oficiais `consumo_*` da Silver no Databricks** (contrato `Order` novo, seções 5, 8 e 9), lidas direto do Databricks ao subir (`DATA_SOURCE=databricks`) ou dos CSVs exportados (`file`, plano B); a tela foi refeita para o contrato novo (seção 13) e o chat simulado foi reescrito (seção 10.3). O chat responde pelo assistente simulado (`AGENT=mock`, padrão) ou pelo agente ADK do Marco (`AGENT=adk`), conferido pela tela contra o agente real em 15/11. O que ainda depende do acordo com o Marco fica isolado em `withOrderContext` e na configuração (seção 10.8). Checklist em [tasks.md](../tasks.md).

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Estrutura de pastas](#2-estrutura-de-pastas)
3. [Como rodar](#3-como-rodar)
4. [Fluxo: da inicialização à resposta](#4-fluxo-da-inicialização-à-resposta)
5. [Contrato (`@translog/contracts`)](#5-contrato-translogcontracts)
6. [API (`@translog/api`)](#6-api-translogapi)
7. [Configuração](#7-configuração)
8. [Fontes de dados](#8-fontes-de-dados)
9. [Mapeamento `consumo_*` → `Order`](#9-mapeamento-consumo_--order)
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
- **`@translog/api` (`api/`)**: API HTTP em Fastify que entrega à tela o pedido pronto para exibir (view model `Order`), lendo dos 9 pedidos da demo versionados (`fixtures`) ou das tabelas `consumo_*` da Silver exportadas em CSV (`file`), e responde o chat (`POST /api/chat`) pelo assistente simulado ou pelo agente ADK do Marco. Os pedidos são carregados uma vez na inicialização e consultados em memória em $O(1)$.
- **`@translog/web` (`web/`)**: Single-Page Application em React 19 + Vite 8 + Tailwind CSS v4 que implementa o design da **Direção D** (estética de manifesto de carga internacional combinada com rota e linha do tempo de 4 etapas integradas) e consome a API real via `@tanstack/react-query`, validando todas as respostas no cliente com os esquemas de `@translog/contracts`.

```
Navegador (@translog/web, :5173)  ──►  API do portal (@translog/api, :3333)  ──►  CSVs consumo_* / fixtures
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
| csv-parse | 7.0.3 | `api` | Leitura dos CSVs em streaming |
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
├── biome.json               # regras de lint/format; ignora _contexto/, dados/, dist/ e *.md
├── .nvmrc                   # 24
├── .env.example             # todas as variáveis, comentadas
├── .dockerignore
├── docker-compose.yml       # API com fixtures
├── docker-compose.dados.yml      # sobreposição: API com os CSVs consumo_* por volume somente leitura
├── docker-compose.databricks.yml # sobreposição: API lendo do Databricks (credenciais do .env, fora da imagem)
├── README.md                # visão geral (não técnica)
├── CLAUDE.md                # regras e comandos para o assistente de código
├── tasks.md                 # checklist por fase
├── docs/backend.md          # este documento técnico (backend + frontend)
├── dados/                   # CSVs das tabelas consumo_* (plano B; no .gitignore; nunca versionar)
├── contracts/               # @translog/contracts
│   └── src/
│       ├── index.ts         # reexporta tudo
│       ├── orders.ts        # Order, enums, params e resposta de samples
│       ├── orders.test.ts   # testes do contrato do pedido
│       ├── chat.ts          # corpo e resposta de POST /api/chat, AgentMode
│       ├── staff-orders.ts  # StaffOrder (visão do colaborador, com o diagnóstico)
│       ├── auth.ts          # login e sessão do colaborador
│       ├── tower.ts         # Torre de controle e resumo por mercado do Início
│       ├── health.ts        # resposta do health, DataSource
│       └── errors.ts        # formato padrão de erro
├── api/                     # @translog/api
│   ├── Dockerfile
│   ├── vitest.config.ts     # isolate: false, TZ=America/Sao_Paulo
│   ├── scripts/
│   │   ├── export-dados.ts    # pnpm export:dados: Databricks → portal/dados/*.csv
│   │   ├── generate-fixtures.ts # pnpm --filter @translog/api fixtures: pedidos da demo
│   │   └── staff-add.ts       # pnpm staff:add <email>: hash da senha para STAFF_USERS
│   └── src/
│       ├── main.ts          # bootstrap: .env → config → servidor → listen
│       ├── server.ts        # Fastify, swagger, error handler, container, rotas (health inline)
│       ├── config.ts        # variáveis de ambiente validadas
│       ├── container.ts     # único lugar que escolhe os adapters (dados e assistente)
│       ├── http/
│       │   └── errors.ts    # único lugar que transforma erros em resposta HTTP
│       ├── testing/
│       │   └── fake-databricks.ts # Databricks falso para os testes (fora da imagem Docker)
│       ├── privacy.test.ts  # varredura de chaves e valores proibidos em todas as respostas (pedidos e chat)
│       ├── auth/
│       │   ├── routes.ts              # /api/auth/login, logout, session e demo (só com AUTH_DEMO)
│       │   ├── auth-service.ts        # login, demonstração, sessão + erros de login
│       │   ├── password.ts            # hash scrypt e comparação em tempo constante
│       │   ├── session-token.ts       # conteúdo do cookie assinado (HMAC)
│       │   ├── session-cookie.ts      # leitura e gravação do cookie HttpOnly
│       │   └── login-limiter.ts       # 5 erros por minuto por IP (memória)
│       ├── staff/
│       │   └── routes.ts              # /api/staff/orders/:id e /api/staff/tower, com o guarda de sessão
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
│           ├── file-repository.ts     # adapter file (3 CSVs em streaming) + carga comum em CSV
│           ├── consumo-mapper.ts      # linhas das tabelas consumo_* → Order (único que conhece o formato)
│           ├── consumo-sql.ts         # SELECT explícito das tabelas (sem colunas proibidas)
│           ├── databricks-client.ts   # SQL Statement Execution API (fetch, EXTERNAL_LINKS, CSV)
│           ├── databricks-repository.ts # adapter databricks (3 consultas no boot → mesma leitura do file)
│           ├── escalation.ts          # regra única de encaminhamento à central
│           ├── order-views.ts         # projeções Order (cliente) e StaffOrder (colaborador)
│           ├── order-stats.ts         # números da carga (contexto do colaborador)
│           ├── tower-stats.ts         # Torre e resumo por mercado (mesma passada da carga)
│           ├── promise-scenario.ts    # "Promessa ajustada" da Gold (constantes)
│           └── fixtures/
│               ├── orders.json        # 9 pedidos da demo (vão para a imagem)
│               └── consumo/           # amostra das 3 tabelas para testes (não vai para a imagem)
└── web/                     # @translog/web (React 19 + Vite 8 + Tailwind v4)
    ├── index.html           # ponto de entrada HTML (pt-BR, título e fontes IBM Plex Mono)
    ├── public/ipnet.svg     # logo do rodapé ("Desenvolvido por")
    ├── package.json
    ├── tsconfig.json        # bundler resolution, jsx: react-jsx, noEmit
    ├── vite.config.ts       # plugin React + Tailwind, proxy /api → http://127.0.0.1:3333
    └── src/
        ├── main.tsx         # QueryClientProvider + montagem do App
        ├── app.tsx          # rotas, guarda da Área do colaborador, conversa e painel do LogBot
        ├── index.css        # @theme inline, @custom-variant dark, classes .label-mono, .perf-t, .route-line
        ├── api/
        │   ├── client.ts    # getJson/postJson + validação Zod com @translog/contracts + classe ApiError
        │   ├── fixtures.ts  # pedidos de exemplo padrão e dicas dos atalhos
        │   ├── fixture-orders.ts # lê api/src/orders/fixtures/orders.json, só nos testes da tela
        │   ├── queries.ts   # useOrderSamples, useOrdersSummary, useOrderQuery, useSendChatMessage
        │   └── session.ts   # sessão, login, demonstração, logout, Torre e pedido do colaborador
        ├── lib/
        │   ├── format.ts    # formatDate (sem new Date), formatCurrency (USD)
        │   ├── router.ts    # rotas, guarda, links de acesso e títulos (lógica pura)
        │   ├── use-location.tsx # URL ↔ React (navigate, Link)
        │   ├── url-state.ts # parseOrderId
        │   └── utils.ts     # utilitário cn() para classes condicionais
        ├── components/
        │   ├── app-header.tsx # cabeçalho público e da Área do colaborador
        │   ├── app-footer.tsx # rodapé discreto
        │   ├── brand-mark.tsx # marca TransLog
        │   └── simple-page.tsx # 404 e "conferindo o acesso"
        └── features/
            ├── home/                      # Início: herói, mapa animado (route-map.tsx), seções
            ├── staff/                     # login, Torre, rastreio do colaborador e formatação
            ├── tracking/
            │   ├── tracking-page.tsx      # rastreio do cliente (pedido vindo da URL)
            │   ├── order-status.ts        # regras puras: tom do badge, mensagem principal, prazo, motivo da central
            │   ├── stage-timeline.ts      # regras puras: etapas da rota e estado de cada uma (buildStageTimeline)
            │   ├── stage-timeline-view.tsx# linha do tempo por etapas, com os eventos de cada uma
            │   ├── deadlines-block.tsx    # despacho x entrega e faixa "Motivo provável" com a explicação
            │   ├── order-search-form.tsx  # input numérico (1..10 dígitos), validação inline e chips de amostra
            │   ├── tracking-states.tsx    # estados vazio, skeleton, não encontrado, erro de servidor e sem conexão
            │   ├── order-manifest-card.tsx# guia de remessa: situação, onde está agora, central, prazos, rota e etapas
            │   ├── order-items-table.tsx  # tabela de itens declarados e rodapé perfurado (.perf-t) com total em USD
            │   └── tracking-panel.tsx     # orquestração da coluna esquerda (60%)
            ├── chat/
            │   ├── chat-session.ts        # regras puras: sessionId, troca de pedido, texto de falha, tipo das mensagens
            │   ├── chat-suggestions.ts    # perguntas sugeridas conforme o pedido aberto
            │   ├── rich-text.ts           # **negrito**, títulos e listas das respostas, sem HTML
            │   ├── chat-messages.tsx      # mensagens, divisor de troca, "digitando…" e falha com "Tentar novamente"
            │   ├── chat-input.tsx         # chips de sugestão contextual + textarea com Enter / Shift+Enter
            │   ├── chat-panel.tsx         # conversa (cabeçalho com minimizar, contexto do pedido, mensagens)
            │   ├── use-chat-conversation.ts # conversa acima das páginas (mesma no Início e no Rastreamento)
            │   ├── logbot-panel.ts        # estado aberto/minimizado (localStorage)
            │   └── logbot-dock.tsx        # painel lateral minimizável
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

Sem `.env`, a API sobe com os `fixtures` (9 pedidos da demo). Para usar a base inteira (65.752 pedidos), coloque os 3 CSVs das tabelas `consumo_*` em `portal/dados/` (ou baixe-os com `pnpm export:dados`, que precisa das credenciais do Databricks no `portal/.env`) e:

```bash
cp .env.example .env
# no .env:
#   DATA_SOURCE=file
pnpm dev
```

Com `file`, cada recarga do `--watch` na API relê os CSVs (~13 s).

Direto do Databricks (credenciais só no `portal/.env`, ver `.env.example`):

```bash
# no .env:
#   DATA_SOURCE=databricks
#   DATABRICKS_HOST=dbc-xxxxxxxx-xxxx.cloud.databricks.com
#   DATABRICKS_WAREHOUSE_ID=<id do warehouse>
#   DATABRICKS_TOKEN=<token>
pnpm dev
```

A API só abre a porta depois de baixar as 3 tabelas (~25 a 40 s com o warehouse acordado; até 3 min se ele estiver dormindo). Cada recarga do `--watch` refaz as 3 consultas e gasta cota da edição gratuita: para mexer no código, prefira `file`. Se o Databricks falhar, a API não sobe e a mensagem diz o que conferir; o plano B é trocar para `DATA_SOURCE=file` (não há troca automática).

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
docker compose up --build                                                        # fixtures
docker compose -f docker-compose.yml -f docker-compose.dados.yml up --build      # CSVs consumo_*
docker compose -f docker-compose.yml -f docker-compose.databricks.yml up --build # Databricks
docker compose down
```

Para não repetir os `-f`, defina `COMPOSE_FILE=docker-compose.yml:docker-compose.dados.yml` (ou `...:docker-compose.databricks.yml`) no `.env`.

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
     │   ├─ DATA_SOURCE=file     → loadFileRepository(DATA_DIR)     lê os 3 CSVs consumo_*
     │   ├─ DATA_SOURCE=databricks → loadDatabricksRepository(...)  3 consultas, download, mesma leitura
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
| `orderStatusSchema`, `shippingModeSchema`, `transportModeSchema`, `routeTypeSchema`, `marketSchema`, `dispatchStatusSchema` | Enums com os valores da base |
| `dispatchSchema`, `deliverySchema`, `stageSchema`, `orderEventSchema` | Partes do `Order` |
| `healthResponseSchema`, `dataSourceSchema` | `{ status: "ok", dataSource: "fixtures" \| "file", orders, agent }` |
| `agentModeSchema` / `AgentMode` | `"mock" \| "adk"` (`AGENT`); o health só informa o modo, não consulta o agente |
| `chatRequestSchema` / `ChatRequest` | Corpo de `POST /api/chat` |
| `chatResponseSchema` / `ChatResponse` | Resposta de `POST /api/chat` |
| `chatSessionIdSchema`, `CHAT_MESSAGE_MAX_LENGTH` | UUID da conversa; limite de 1000 caracteres da mensagem |
| `errorResponseSchema` | `{ error: { code, message } }` |
| `staffOrderSchema` / `StaffOrder` | Resposta de `GET /api/staff/orders/:orderId`: o `Order` com causas da base, `explanation`, `market`, `routeService` e o diagnóstico |
| `loginRequestSchema`, `sessionResponseSchema`, `DEMO_STAFF_EMAIL` | Login do colaborador (`contracts/src/auth.ts`): `{ email, password }` e `{ authenticated, email, demoAvailable }` |
| `towerResponseSchema` / `TowerResponse` | Torre de controle (`contracts/src/tower.ts`): indicadores, fila de atenção, promessa × realidade, etapas, rotas, `dashboardUrl` |
| `ordersSummaryResponseSchema` | `{ totalOrders, markets: [{ market, orders }] }` (mapa do Início, público) |

### `Order`

Mudou em 16/11 com as tabelas `consumo_*`: saíram `trackingStatus`, `deadlineStatus`, `delayWindow`, `delayDays`, `estimatedDeliveryDate`, `actualDeliveryDate` e o `probableCause` único. Despacho e entrega têm prazos e causas separados.

| Campo | Tipo | Valores / formato |
|---|---|---|
| `orderId` | inteiro positivo, até 10 dígitos | ex.: `76902` |
| `orderDate` | texto `AAAA-MM-DD` | data de calendário, sem hora nem fuso |
| `referenceDate` | texto `AAAA-MM-DD` | "hoje" da base (`data_referencia_base`, 2018-02-06); nada usa a data do computador |
| `status` | enum | `Entregue no prazo`, `Entregue com atraso`, `Em trânsito`, `Extraviado`, `Cancelado`, `Não pago (expirado)`, `Aguardando pagamento` |
| `shippingMode` | enum | `Standard Class`, `Second Class`, `First Class`, `Same Day` |
| `transportMode` | enum ou `null` | `Aéreo consolidado`, `Aéreo expresso`, `Rodoviário`; `null` sem despacho |
| `routeType` | enum | `Internacional`, `Doméstica` (doméstica nunca tem alfândega) |
| `origin`, `destination` | texto | `Cidade, Estado, País` |
| `region` | texto | em português, ex.: `América Central` |
| `market` | enum | `LATAM`, `Europe`, `Pacific Asia`, `USCA`, `Africa` |
| `dispatch` | objeto | `promisedDays`, `expectedDate`, `actualDate`, `delayDays`, `status` (`Atrasado`, `No Prazo`, `Adiantado`, `Não Avaliado`, `Cancelado`), `probableCause` |
| `delivery` | objeto | `expectedDate`, `actualDate`, `delayDays` (em trânsito, conta até `referenceDate`), `probableCause` |
| `explanation` | texto ou `null` | frase pronta da base (`motivo_ocorrencia`) |
| `currentStage` | `{ number 0..5, label }` ou `null` | etapa atual ou última (`3 - Alfândega` → `{ 3, "Alfândega" }`) |
| `currentLocation` | texto ou `null` | onde o volume está (ou foi entregue, ou visto pela última vez) |
| `lostAtStage` | `{ number, label }` ou `null` | etapa do extravio |
| `events` | lista, mínimo 1 | `{ date, code, description, stage, stageLabel, location }`, em ordem de `sequencia` |
| `items` | lista, mínimo 1 | `{ productName, category, quantity, total }`; "N itens" = linhas, unidades = soma de `quantity` |
| `total` | número ≥ 0 | dólar; soma dos itens |
| `escalateToSupport` | booleano | atraso de entrega ≥ 3 dias ou extravio (regra em `orders/escalation.ts`) |

`probableCause` (em `dispatch` e `delivery`) vem como na base: `Promessa irreal`, `Atraso operacional`, `Atraso no despacho não recuperado no transporte`, `Volume sem atualização de rastreio`. "Sem atraso" vira `null`. Na tela o rótulo é sempre "Motivo provável". Etapas: 0 Pedido · 1 Coleta · 2 Voo · 3 Alfândega · 4 Transferência · 5 Última milha. O contrato não tem regras entre campos (ex.: "`actualDate` só se entregue"): quem garante são os dados (conferidos em 16/11) e o mapper, com testes.

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
| `GET /api/orders/summary` | `200 { totalOrders, markets }`: pedidos por mercado (só números, calculados na carga) | |
| `POST /api/auth/login` | `204` + cookie de sessão | `401 INVALID_CREDENTIALS` (mesma resposta para e-mail ou senha errados), `429 TOO_MANY_ATTEMPTS`, `415` sem JSON |
| `POST /api/auth/logout` | `204` (apaga o cookie) | |
| `GET /api/auth/session` | `200 { authenticated, email, demoAvailable }` | |
| `POST /api/auth/demo` | `204` + cookie de `demo@translog.local` | só existe com `AUTH_DEMO=true` (senão `404`) |
| `GET /api/staff/orders/:orderId` | `200 StaffOrder` | `401 UNAUTHENTICATED`, `400`, `404 ORDER_NOT_FOUND` |
| `GET /api/staff/tower` | `200 TowerResponse` | `401 UNAUTHENTICATED` |
| `GET /docs` | Swagger UI (`/docs/json` = OpenAPI) | |

**Login do colaborador (`api/src/auth/`, 17/11).** A proteção é na API, não só na tela:

- usuários em `STAFF_USERS` (`email:hash`, separados por vírgula; hash `scrypt.<sal>.<chave>` gerado por `pnpm staff:add <email>`, que pede a senha sem ecoar); comparação em tempo constante e o mesmo trabalho para e-mail inexistente;
- sessão num cookie `translog_session` assinado com HMAC-SHA256 (`SESSION_SECRET`, mínimo de 32 caracteres), `HttpOnly`, `SameSite=Lax`, `Path=/`, 8 h, `Secure` com `NODE_ENV=production`. Sem banco de sessões; feito com `node:crypto` (sem `@fastify/cookie`);
- `/api/staff/*` passa por um único hook (`staff/routes.ts`) que exige sessão válida;
- 5 logins errados em 1 minuto do mesmo IP → `429` (em memória; zera ao reiniciar a API e após um login certo);
- `POST` de `/api/auth/*` só com `Content-Type: application/json` (com `SameSite=Lax`, cobre CSRF neste escopo);
- log do login só com o resultado (`ok`, `rejected`, `demo`): sem e-mail, senha ou cookie.

**Torre e resumo (`orders/tower-stats.ts`).** Acumulados na mesma passada da carga que já calcula o contexto do colaborador (`computeOrderStats`), nos 3 modos. Definições: despacho avaliado = tem data real, no prazo = `dispatch.delayDays <= 0`; entrega avaliada = tem atraso calculado (entregues e em trânsito; extraviados fora); fila de atenção = todos os em trânsito, mais atrasados primeiro; rotas com mais atraso = `rota_servico` com 300+ entregas avaliadas (8 primeiras). Conferido com os CSVs reais (17/11): 42,7% (15.739/36.866), 74,7% (22.130/29.644), 197 em trânsito (43 atrasados, 23 com 3+ dias), 8.337 na central, 7.222 extravios. A "Promessa ajustada" vem de `orders/promise-scenario.ts` (`ADJUSTED_PROMISE_SCENARIO`, constantes copiadas de `workspace.gold.param_cenario_prazo`: First 2, Same Day 1, Second 4, Standard 4); ler a tabela da Gold é pendência.

O `orderId` aceita só dígitos (1 a 10), maior que zero; zeros à esquerda passam (`00375` → 375). `1e3`, `0x1F`, `-1`, `1.5`, espaços e 11 dígitos são recusados.

```bash
curl localhost:3333/api/orders/76902
```

```json
{
  "orderId": 76902,
  "orderDate": "2018-01-27",
  "referenceDate": "2018-02-06",
  "status": "Em trânsito",
  "shippingMode": "First Class",
  "transportMode": "Aéreo expresso",
  "routeType": "Internacional",
  "origin": "San Jose, Califórnia, Estados Unidos",
  "destination": "Jacarta, Jacarta, Indonésia",
  "region": "Sudeste Asiático",
  "market": "Pacific Asia",
  "dispatch": {
    "promisedDays": 1,
    "expectedDate": "2018-01-28",
    "actualDate": "2018-01-29",
    "delayDays": 1,
    "status": "Atrasado",
    "probableCause": "Promessa irreal"
  },
  "delivery": {
    "expectedDate": "2018-02-01",
    "actualDate": null,
    "delayDays": 5,
    "probableCause": "Volume sem atualização de rastreio"
  },
  "explanation": "Despacho em 2 dia(s), 1 dia(s) além do prazo de despacho de 1 dia(s). O prazo de despacho da modalidade First Class é cumprido em apenas 0.0% dos pedidos. Pedido em transporte; o prazo de entrega foi ultrapassado em 5 dia(s).",
  "currentStage": {
    "number": 3,
    "label": "Alfândega"
  },
  "currentLocation": "Alfândega Jacarta (Indonésia)",
  "lostAtStage": null,
  "events": [
    {
      "date": "2018-01-27",
      "code": "PEDIDO_CRIADO",
      "description": "Pedido registrado",
      "stage": 0,
      "stageLabel": "Pedido",
      "location": "Pedido registrado no sistema"
    },
    {
      "date": "2018-01-29",
      "code": "PEDIDO_DESPACHADO",
      "description": "Pedido despachado",
      "stage": 1,
      "stageLabel": "Coleta",
      "location": "Pedido despachado pela expedição de origem"
    },
    {
      "date": "2018-01-29",
      "code": "COLETA_GATEWAY",
      "description": "Recebido no gateway de origem",
      "stage": 1,
      "stageLabel": "Coleta",
      "location": "Gateway Los Angeles (EUA)"
    },
    {
      "date": "2018-01-30",
      "code": "PARTIDA_VOO",
      "description": "Partida do voo",
      "stage": 2,
      "stageLabel": "Voo",
      "location": "Em voo: Los Angeles -> Jacarta (Indonésia)"
    },
    {
      "date": "2018-01-31",
      "code": "CHEGADA_ALFANDEGA",
      "description": "Chegada à alfândega",
      "stage": 3,
      "stageLabel": "Alfândega",
      "location": "Alfândega Jacarta (Indonésia)"
    }
  ],
  "items": [
    {
      "productName": "Summer dresses",
      "category": "Women's Clothing",
      "quantity": 1,
      "total": 194.24
    }
  ],
  "total": 194.24,
  "escalateToSupport": true
}
```

(Igual com `fixtures`, `file` e `databricks`.)

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
| `DATA_SOURCE` | `fixtures` | `fixtures`, `file` ou `databricks` |
| `DATA_DIR` | `dados` | Pasta com `consumo_pedidos.csv`, `consumo_itens_pedido.csv` e `consumo_eventos_logisticos.csv` (`file` e `pnpm export:dados`). Relativo parte de `portal/`. Substitui `ORDERS_FILE` (16/11) |
| `SAMPLE_ORDER_IDS` | `76902,375,34,8` | Lista separada por vírgula; cada item inteiro positivo de até 10 dígitos; repetidos são removidos |
| `DATABRICKS_HOST` | vazio | Host do workspace (sem ou com `https://`); obrigatório com `databricks`. `http://` só para `localhost`/`127.0.0.1` (testes) |
| `DATABRICKS_WAREHOUSE_ID` | vazio | Id do SQL warehouse (letras, números, `_`, `-`); obrigatório com `databricks` |
| `DATABRICKS_TOKEN` | vazio | Token de acesso; obrigatório com `databricks`. Só no `portal/.env`; a mensagem de erro de configuração nunca mostra o valor |
| `DATABRICKS_CATALOG_SCHEMA` | `workspace.silver` | `catalogo.schema` das tabelas `consumo_*` (vai no SQL: só letras, números e `_`) |
| `AGENT` | `mock` | Assistente do chat: `mock` ou `adk` |
| `AGENT_URL` | vazio | Endereço http(s) do agente; obrigatório com `adk` (dev: `http://127.0.0.1:8001`). Barra final removida |
| `AGENT_APP_NAME` | `translog_agent` | Nome do app no ADK; só letras, números, `_` e `-` (vai no caminho da URL) |
| `AGENT_TIMEOUT_MS` | `90000` | Limite por resposta do agente, de 1000 a 600000 ms (o agente já levou 54 s) |
| `STAFF_USERS` | vazio | Usuários do colaborador: `email:hash` separados por vírgula (`pnpm staff:add <email>`). Nunca aparece na mensagem de erro |
| `SESSION_SECRET` | vazio | Segredo do cookie de sessão (32+ caracteres); obrigatório com `STAFF_USERS` ou `AUTH_DEMO=true`. Nunca aparece na mensagem de erro |
| `AUTH_DEMO` | `false` | `true` liga "Entrar como demonstração" (`POST /api/auth/demo`); só para o desenvolvimento e a banca |
| `DASHBOARD_URL` | vazio | Link "Painel completo de performance" da Torre; vazio = "link a definir" |
| `NODE_ENV` | vazio | `production` = log em JSON e cookie `Secure`; ausente = legível (pino-pretty) |
| `WEB_PORT` | `5173` | Porta do Vite dev server (só o frontend em dev); o proxy `/api` usa `API_PORT` |

Regras (`api/src/config.ts`):

- Variável vazia conta como não definida (o compose repassa vazios).
- O `.env` fica em `portal/.env` e é lido com `process.loadEnvFile()` no `main.ts`, só se existir. Variáveis do ambiente têm prioridade. (Não usamos `node --env-file-if-exists`: com `--watch` e sem `.env`, o Node 24.21 aborta no Ctrl+C.)
- Valor inválido: a API não sobe e lista **todas** as variáveis com problema de uma vez, por exemplo:

  ```
  Configuração inválida:
    - SAMPLE_ORDER_IDS deve ser uma lista de números de pedido separados por vírgula (inteiros positivos de até 10 dígitos) (recebido: "15,x")
    - AGENT_URL deve ser o endereço http(s) do agente, obrigatório com AGENT=adk (ex.: http://127.0.0.1:8001) (não definida)
  ```

- No Docker, `DATA_SOURCE` e `DATA_DIR` do `.env` não valem: a fonte é escolhida pelos arquivos de compose (seção 15). `AGENT` fica fixo em `mock` no compose.
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

### Tabelas oficiais (16/11)

A fonte é a **Silver do Databricks, tabelas com prefixo `consumo_`** (feitas pelo Mateus para a aplicação). A Gold é toda agregada (para o dashboard) e não serve para consultar pedido por número. Levantamento completo em `portal/_contexto/databricks.md` (local).

| Tabela | Grão | Linhas |
|---|---|---|
| `workspace.silver.consumo_pedidos` | 1 por pedido | 65.752 |
| `workspace.silver.consumo_itens_pedido` | 1 por item (com valor por item) | 180.519 |
| `workspace.silver.consumo_eventos_logisticos` | 1 por evento da viagem | 350.416 |

Os três adapters carregam tudo uma vez, ao subir, e servem da memória. Não há consulta ao Databricks por pedido nem atualização periódica.

### `fixtures`

- `orders/fixtures/orders.json`: os 9 pedidos da demo (76902, 375, 34, 222, 8, 9, 50, 31298, 76385), gerados das tabelas por `pnpm --filter @translog/api fixtures` (`api/scripts/generate-fixtures.ts`), que também gera a amostra de teste `orders/fixtures/consumo/`.
- Validados contra `z.array(orderSchema)` ao carregar. Arquivo inválido impede a API de subir, com a mensagem do Zod apontando o campo. Campos fora do contrato são descartados na leitura.

### `file` (CSVs das tabelas `consumo_*`, plano B)

`loadFileRepository(dir, log)` lê `DATA_DIR/consumo_pedidos.csv`, `consumo_itens_pedido.csv` e `consumo_eventos_logisticos.csv`. A carga é a de `loadConsumoRepository(sources, log)`, feita para ser reaproveitada pelo adapter `databricks` (os pedaços em CSV do Databricks entram pelo mesmo caminho):

1. Cada tabela é lida numa passada, em streaming (`pipeline(stream, parse(...), consumidor)`), com registros como arrays.
2. O cabeçalho define a posição de cada coluna de `READ_COLUMNS` da tabela. Se faltar alguma, a carga é interrompida com erro.
3. Cada registro vira um objeto **só com as colunas lidas**. As demais, inclusive as proibidas, são descartadas ali, antes de qualquer agrupamento.
4. Pedidos num `Map` por número; itens e eventos agrupados por número do pedido (não precisam estar em ordem).
5. Cada pedido passa por `mapConsumoOrder` (que valida com `orderSchema`). Pedido fora do contrato é descartado com seus itens e eventos.
6. São contadas como inválidas: linha curta, `id_pedido` inválido, pedido repetido, pedido fora do contrato (com suas linhas) e itens ou eventos sem pedido.
7. Log de resumo.

Os CSVs do Mateus (timestamps ISO em UTC, com as colunas proibidas) e os do `pnpm export:dados` (datas já `AAAA-MM-DD`, sem as colunas proibidas) produzem os mesmos pedidos: os testes usam os dois formatos.

Opções do `csv-parse`: `bom: true`, `relax_column_count: true` (linha curta vira inválida em vez de derrubar a carga) e `skip_empty_lines: true`.

#### Log

Até 10 avisos detalhados, depois só a contagem. Os avisos nunca trazem o conteúdo das linhas, só tabela, número do registro, número do pedido e nome dos campos:

```json
{"table":"consumo_pedidos.csv","record":10,"reason":"id_pedido inválido","msg":"Linha inválida; ignorada"}
{"orderId":99001,"rows":11,"fields":["status"],"msg":"Pedido fora do contrato; ignorado"}
{"table":"consumo_itens_pedido.csv","orderId":99003,"rows":1,"msg":"Linhas sem pedido; ignoradas"}
{"dataDir":"/caminho/portal/dados","orders":65752,"invalidRows":0,"durationMs":12583,"msg":"Pedidos carregados"}
```

#### Erros fatais (a API não sobe)

| Situação | Mensagem |
|---|---|
| Pasta ou arquivo inexistente | `Não foi possível ler DATA_DIR (<pasta>): consumo_pedidos.csv não encontrado.` |
| Caminho é uma pasta | `... consumo_pedidos.csv é uma pasta, não um arquivo.` |
| Sem permissão | `... consumo_pedidos.csv sem permissão de leitura.` |
| Arquivo vazio | `... consumo_itens_pedido.csv está vazio.` |
| Coluna lida ausente no cabeçalho | `... consumo_pedidos.csv não tem as colunas <lista>.` |

#### Desempenho e memória (16/11, CSVs do export: 83 + 14 + 64 MB)

| Medida | Local (Node 24.21) |
|---|---|
| Carga das 3 tabelas | 12,6 s |
| RSS com a API no ar | ~213 MB |
| Pedidos / linhas inválidas | 65.752 / 0 |

Escolhas mantidas da Silver antiga (que reduziram o heap retido de 230 para 47 MB): `Object.fromEntries` para montar cada linha (sem modo dicionário do V8), apagar as linhas de cada pedido do `Map` assim que ele é montado (o closure do `pipeline` mantém o contexto vivo) e um pool de textos (`intern`), já que quase tudo se repete (modalidades, regiões, produtos, datas, locais dos eventos). O pool é limpo no fim.

O tempo de carga é quase todo da `csv-parse`. Alternativa medida em 14/11 e não adotada: `papaparse` (mais rápido, mas sem remover o BOM e com mais código de erro).

### `pnpm export:dados` (Databricks → CSV)

`api/scripts/export-dados.ts` baixa as 3 tabelas para `DATA_DIR` (padrão `portal/dados/`), lendo `DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_ID` e `DATABRICKS_TOKEN` do ambiente ou do `portal/.env` (nunca impressos). Usa `orders/databricks-client.ts`:

1. `POST https://<host>/api/2.0/sql/statements` com `disposition: "EXTERNAL_LINKS"`, `format: "CSV"`, `wait_timeout: "30s"` e `on_wait_timeout: "CONTINUE"` (o resultado não cabe na resposta direta). O token vai só no header `Authorization` dessas chamadas.
2. Enquanto `PENDING`/`RUNNING`, consulta `GET /api/2.0/sql/statements/{id}` a cada 2 s, com limite de 3 min (o warehouse da edição gratuita dorme); no limite, cancela a consulta e explica o que fazer. `401`/`403`, `FAILED` (ex.: tabela ausente) e host inacessível viram mensagens em pt-BR que sugerem `DATA_SOURCE=file`.
3. Baixa os pedaços pelos links pré-assinados **sem** o header `Authorization`, seguindo `next_chunk_internal_link`. O cabeçalho do CSV sai uma vez só.
4. Cada arquivo vai para um `.parcial` e só substitui o anterior quando o download termina.

O `SELECT` vem de `orders/consumo-sql.ts`: colunas explícitas (`EXPORT_COLUMNS` = todas menos as proibidas), cada uma como `coalesce(CAST(col AS STRING), '')` (o CSV do Databricks escreve NULL como `null`; assim sai vazio, igual aos CSVs do Mateus), timestamps como `date_format(col, 'yyyy-MM-dd')` (a sessão do warehouse é UTC) e `ORDER BY` estável. Schema e nomes de coluna são conferidos antes de entrar no SQL.

**Medido em 16/11** (antes do download dos pedaços em paralelo, hoje até 4 por tabela): 58 a 72 s no total (a primeira tabela leva mais quando o warehouse está acordando); `consumo_pedidos` 79,6 MB (40 colunas), `consumo_itens_pedido` 13,5 MB (7), `consumo_eventos_logisticos` 61,1 MB (14). Comparado célula a célula com os CSVs do Mateus: mesmas chaves e mesmos valores nas 596.687 linhas (fora o espaço no fim do `resumo_pedido`, que o CSV do Mateus apara).

### `databricks` (tabelas lidas do Databricks ao subir)

`loadDatabricksRepository(options, log)` em `orders/databricks-repository.ts`:

1. As 3 consultas rodam **em paralelo** no warehouse, com o `SELECT` de `consumo-sql.ts` só com as colunas que o portal lê (`READ_COLUMNS`), sem as proibidas.
2. Os pedaços das 3 tabelas são baixados **ao mesmo tempo** (até 4 por tabela), pelos links pré-assinados, sem o header `Authorization`. Ficam em `Buffer` só até a leitura (~76 MB no pico, fora do heap).
3. Cada tabela é entregue ao `loadConsumoRepository` (a mesma leitura e conversão do `file`) em fatias de 64 KB, e os pedaços são soltos depois de lidos.

Sem fallback automático: se algo falhar, a API não sobe, e a mensagem diz o que fazer.

| Situação | Mensagem (início) |
|---|---|
| Variável faltando | `Configuração inválida: - DATABRICKS_HOST deve ser o host do workspace, obrigatório com DATA_SOURCE=databricks ...` |
| Token recusado (`401`/`403`) | `Não foi possível carregar workspace.silver.consumo_... do Databricks: O Databricks recusou o acesso (HTTP 401). Confira DATABRICKS_TOKEN ... use DATA_SOURCE=file ...` |
| Tabela ausente (`FAILED`) | `... A consulta terminou com FAILED (BAD_REQUEST): [TABLE_OR_VIEW_NOT_FOUND] ... Confira se a tabela existe ... use DATA_SOURCE=file ...` |
| Warehouse sem responder em 3 min | `... A consulta não terminou em 180 s (estado PENDING). O warehouse pode estar ligando ou sem cota ... use DATA_SOURCE=file ...` |
| Host inacessível | `... Não foi possível conectar ao Databricks (ENOTFOUND). Confira DATABRICKS_HOST e a rede ...` |
| Falha no download | `Não foi possível baixar ... do Databricks: Falha ao baixar o pedaço N do resultado (HTTP 403). Tente de novo ou use DATA_SOURCE=file ...` |

Log (sem dados nem token):

```json
{"catalogSchema":"workspace.silver","rows":{"orders":65752,"items":180519,"events":350416},"megabytes":76,"queryMs":1468,"downloadMs":23163,"msg":"Tabelas baixadas do Databricks"}
{"dataSource":"databricks","catalogSchema":"workspace.silver","orders":65752,"invalidRows":0,"durationMs":10069,"msg":"Pedidos carregados"}
```

#### Medido em 16/11 (Databricks real, warehouse acordado)

| Medida | Valor |
|---|---|
| Consultas (as 3 em paralelo) | 1,5 s |
| Download (76 MB) | 10,8 a 23,2 s (varia com a rede) |
| Leitura e conversão | ~10 s |
| Até o health responder | 24 a 36 s |
| Pedidos / linhas inválidas | 65.752 / 0 |
| Comparação com `file` | 18 pedidos (os 9 da demo, 8 variados e 1 inexistente) idênticos |

Antes do download em paralelo, a carga levava ~100 s: cada link pré-assinado sai a ~1,4 MB/s, e os pedaços eram baixados um por vez.

**Memória.** O RSS varia muito entre execuções iguais, nos dois modos (de ~210 a ~730 MB, conforme o momento em que o V8 coleta lixo); o heap retido depois da coleta fica em ~103 MB. Entregar ao `csv-parse` os pedaços inteiros (~20 MB) deixava os `Buffer` presos (RSS ~670 MB numa simulação com os CSVs locais); em fatias de 64 KB, ~425 MB.

## 9. Mapeamento `consumo_*` → `Order`

Tudo em `orders/consumo-mapper.ts`. É o único arquivo que conhece os nomes e formatos das tabelas.

| Campo | Coluna(s) | Regra |
|---|---|---|
| `orderId` | `id_pedido` | Chave dos três agrupamentos |
| `orderDate`, `referenceDate` | `data_pedido`, `data_referencia_base` | 10 primeiros caracteres |
| `status`, `shippingMode`, `routeType`, `market`, `region` | `situacao_pedido`, `modo_envio`, `tipo_rota`, `mercado_logistico`, `destino_regiao` (do pedido, em português) | Como vêm |
| `transportMode` | `modal_transporte` | Vazio → `null` |
| `origin`, `destination` | `origem_cliente_*`, `destino_*` | `Cidade, Estado, País`, sem partes vazias |
| `dispatch` | `prazo_despacho_dias`, `data_despacho_prevista`, `data_despacho_real`, `dias_atraso_despacho`, `status_prazo_despacho`, `causa_atraso_despacho` | Vazio → `null`; "Sem atraso" → `null` |
| `delivery` | `data_entrega_prevista`, `data_entrega_realizada`, `dias_atraso_entrega`, `causa_atraso_entrega` | Idem |
| `explanation`, `currentLocation` | `motivo_ocorrencia`, `local_atual` | Vazio → `null` |
| `currentStage`, `lostAtStage` | `etapa_atual_desc`, `etapa_extravio` | `"3 - Alfândega"` → `{ number: 3, label: "Alfândega" }` |
| `events[]` | `consumo_eventos_logisticos`: `sequencia`, `ts_evento`, `codigo_evento`, `descricao_evento`, `etapa`, `etapa_desc`, `local_evento` | Ordem numérica de `sequencia`; data = 10 primeiros caracteres |
| `items[]` | `consumo_itens_pedido`: `id_item_pedido`, `nome_produto`, `categoria_produto`, `quantidade_item`, `valor_item_pedido` | Ordem de `id_item_pedido`; valor líquido do item (não usa `lista_itens`, que corta os nomes) |
| `total` | soma de `valor_item_pedido` | Em centavos inteiros (igual a `valor_total_pedido` em 100% dos pedidos) |
| `escalateToSupport` | `situacao_pedido`, `dias_atraso_entrega` | `shouldEscalateToSupport` (`orders/escalation.ts`): `Extraviado` ou atraso ≥ 3 dias (`SUPPORT_MIN_DELAY_DAYS`) |

Texto vazio em campo numérico obrigatório vira `NaN` e falha na validação, em vez de virar `0`. `qtd_itens` não é lido: é a soma das quantidades, não o número de linhas.

**Armadilha de fuso.** Os timestamps vêm em UTC (`2018-01-20T00:43:00.000Z`). Com `new Date()`, em Brasília, horários de madrugada cairiam no dia anterior. O mapper corta o texto e nunca cria `Date`; no export, a data já sai cortada no SQL. As datas batem com `data_pedido`, `data_despacho_real` e `data_entrega_realizada` em 100% dos pedidos, e as do 375 com a coluna `linha_do_tempo` (06/01, 12/01, 13/01… 17/01/2015). Os testes rodam com `TZ=America/Sao_Paulo` e o teste do fuso confere antes que `new Date()` de fato mudaria o dia.

**Colunas proibidas** (`FORBIDDEN_COLUMNS`, nunca lidas nem consultadas): `id_cliente`, `segmento_cliente`, `valor_desconto`, `valor_bruto_venda`, `preco_unitario`, `id_produto`. A descrição da `consumo_pedidos` diz "sem PII", mas ela tem `id_cliente` e `segmento_cliente`.

**Verificação (16/11):** com os CSVs reais, 65.752 pedidos e 0 linhas inválidas; situações com as mesmas contagens do Databricks; 8.337 encaminhados à central (igual ao levantamento); os 9 pedidos da demo iguais aos `fixtures`.

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

`mock-agent.ts`, reescrito em 16/11 para o contrato das tabelas `consumo_*`, com tom amigável e gentil. Responde cada mensagem sozinha, consultando a fonte configurada (funciona com a base inteira). Intenções, nesta ordem:

| Mensagem | Resposta |
|---|---|
| Cita pedido inexistente (com "pedido" ou só o número) | "Não encontrei o pedido **#N** na nossa base. Pode conferir o número? …" |
| "modalidade", "tipos de envio", "formas de envio", "classe" | `MODES_REPLY`: as 4 modalidades e o prazo de despacho de cada uma |
| "central", "atendimento", "atendente", "humano", "telefone", "contato" | `SUPPORT_REPLY` (horário e regra); com pedido encaminhado, "O pedido **#N** se enquadra: …" |
| "atras", "por que", "motivo", "demor", "causa" | `buildWhyReply`: motivo provável de cada etapa ("No despacho, que saiu N dias depois do prometido, o motivo provável é …"; "Na entrega, …"), com uma explicação de cada causa sempre como hipótese; sem atraso de entrega, diz que não atrasou (e se o transporte recuperou o despacho); extravio, cancelado, não pago e aguardando pagamento têm frase própria |
| "onde", "local", "rastre", "aconteceu", "extravi"… | `buildWhereReply`: local atual, etapa e desde quando (em trânsito); nos demais, a situação |
| "quando", "chega", "prazo", "situac", "status", "acompanh"…, ou só o pedido | `buildStatusReply`: situação, datas, atraso e local, por situação |
| Pergunta de pedido sem pedido aberto nem citado | `ASK_NUMBER_REPLY`: pede o número (ex.: 76902) |
| Cumprimento ("oi", "bom dia"…) | `GREETING_REPLY` com o nome do assistente; com pedido aberto, cita o pedido |
| Fora do escopo | `FALLBACK_REPLY`: diz com gentileza o que sabe fazer |

Regras fixas:
- a causa é sempre "motivo provável" (testado: nenhuma resposta diz "comprovado", "com certeza" ou "causa do atraso");
- o aviso da central ("Como a entrega já está N dias atrasada / houve extravio, este caso é acompanhado pela nossa **central de atendimento**, que funciona de **segunda a sexta, das 9h às 18h**") só aparece quando a API marcou `escalateToSupport` (testado nos 9 pedidos);
- horário e limite vêm de `orders/escalation.ts` (`SUPPORT_HOURS`, `SUPPORT_MIN_DELAY_DAYS`); o nome, de `ASSISTANT_NAME` (`@translog/contracts`), o mesmo da tela;
- nada de dados do cliente nem do tipo de pagamento (só a situação do pedido, como "Aguardando pagamento").

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

1. **Leitura e consulta por lista de permitidas.** O adapter `file` copia só `READ_COLUMNS`, e o `SELECT` do Databricks lista colunas explícitas (`consumo-sql.ts` recusa as proibidas). As colunas proibidas não chegam a nenhuma estrutura da aplicação, e o `pnpm export:dados` grava os CSVs já sem elas.
2. **Contrato sem campos sensíveis.** `orderSchema` não tem esses campos. Os `fixtures` passam por ele ao carregar, o que descarta qualquer extra.
3. **Serialização pelo contrato.** O serializer do `fastify-type-provider-zod` passa a resposta por `safeEncode` do Zod, que descarta chaves fora do esquema, inclusive dentro de `items`.
4. **Testes** (`privacy.test.ts`):
   - varre todas as chaves, em qualquer nível, de todas as respostas (sucesso, erros, `/docs/json`), nas duas fontes;
   - confere que nenhuma resposta contém os valores fictícios das colunas proibidas (`FICTICIO-*`, presentes nas 3 tabelas da amostra) e sem uso (`SEM-USO`);
   - usa um repositório que devolve `id_cliente`, `preco_unitario` etc. para provar a camada 3.
5. **Logs sem conteúdo.** Linhas e pedidos inválidos são logados só com número do registro, número do pedido e o nome dos campos. O chat registra só sessão, tamanho, modo, tempo e resultado (seção 10.5). Erros 4xx registram só `statusCode` e `code`: a mensagem de JSON malformado do Node traz um trecho do corpo enviado.
6. **Chat.** A resposta passa por `chatResponseSchema` (só `sessionId`, `reply`, `mentionedOrderId`). O simulado monta o texto só com campos do `Order`. `privacy.test.ts` pergunta ao simulado sobre todos os pedidos, nas duas fontes e com um repositório que devolve campos proibidos, e confere chaves, valores fictícios e palavras proibidas no texto (cliente, tipo de pagamento, lucro, margem, desconto, preço unitário, latitude...). "pagamento" sozinho é permitido desde 16/11: as situações `Aguardando pagamento` e `Não pago (expirado)` são dados do pedido. **Limite:** com `AGENT=adk`, o texto é produzido pelo agente a partir da base que ele lê; o portal não filtra esse texto. A privacidade depende do agente ler só colunas permitidas (pendência com o Marco).
7. **Dados fora do Git e da imagem.** `portal/dados/` está no `.gitignore` da raiz; o `.dockerignore` tira `dados/` e qualquer `*.csv`. No Docker, os CSVs entram por volume somente leitura. O token do Databricks fica só no `portal/.env`.

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

A interface web foi construída em React 19 + Vite 8 + Tailwind CSS v4 implementando fielmente o protótipo **Direção D** (o HTML do protótipo saiu do repositório em 17/11; está no histórico do Git, em `portal/prototipos/translog-prototipo-direcao-d.html`).

### 13.1. Identidade visual e Design System (`src/index.css`)

- **Tipografia técnica dupla:**
  - `Inter Variable` (`--font-sans`, via `@fontsource-variable/inter`) para leitura fluida de títulos, rótulos principais e mensagens do assistente;
  - `IBM Plex Mono` (`--font-mono`) para números de pedido, datas, contagens de dias, preços em dólar e cabeçalhos rotulados (`.label-mono`).
  - Números tabulares forçados com `.tabular { font-variant-numeric: tabular-nums; }` para evitar deslocamento horizontal ao alternar pedidos.
- **Paleta, contraste e interatividade (`@theme inline` + `@layer base`):**
  - Azul-petróleo `#0F4C81` (`--color-primary`) como cor primária de autoridade e foco;
  - Âmbar `#F59E0B` (`--color-accent`) reservado para atenção ("Motivo provável" e "Aguardando pagamento");
  - Vermelho (`red-600` / `red-700` / `red-50`) exclusivo para atraso de entrega e extravio: etiqueta de prazo, dias de atraso, fita superior do manifesto, "Onde está agora" atrasado e etapa atual ou do extravio na linha do tempo;
  - Verde (`emerald-700` / `emerald-50`) para pedidos entregues no prazo ou adiantados;
  - Neutros `slate` (apenas tema claro);
  - Regras em `@layer base` corrigem o cursor padrão de botões do Tailwind v4 (`cursor: pointer` em botões ativos) e padronizam `:focus-visible`.
- **Detalhes gráficos de manifesto internacional:**
  - `.perf-t`: divisor horizontal com serrilhado de manifesto logístico no rodapé de total da fatura;
  - `.route-line`: conector horizontal tracejado ligando origem e destino no cabeçalho da rota;
  - Fita superior semântica de `3px` no `OrderManifestCard`.

### 13.2. Rotas e telas (`src/app.tsx`, `src/lib/router.ts`)

Roteador feito à mão com a History API (URLs limpas): são cinco rotas fixas, sem aninhamento nem carregamento por rota, e uma dependência (`react-router`) traria mais do que usamos. A lógica é pura e testada (`router.ts`); `use-location.tsx` liga a URL ao React (`useLocationHref`, `navigate`, `Link`). O Vite serve o `index.html` em qualquer caminho.

| Endereço | Tela |
|---|---|
| `/` | Início do cliente (herói com busca e mapa animado, números, como funciona, modalidades, central) |
| `/rastreio?pedido=N` | Rastreio do cliente. `/?pedido=N` (endereço antigo) abre o rastreio e vira `/rastreio?pedido=N` |
| `/colaborador/entrar` | Login do colaborador (`?voltar=` = página pedida, só caminhos de `/colaborador`; `?expirou=1` = aviso de sessão expirada) |
| `/colaborador` | Torre de controle |
| `/colaborador/pedidos/:id` | Rastreio do colaborador (visão do `StaffOrder`) |

- **Guarda (`guardRedirect`):** sem sessão, as páginas da área vão ao login lembrando a página; já com sessão, o login leva à página pedida ou à Torre. A tela pergunta `GET /api/auth/session` (nunca lê o cookie `HttpOnly`).
- **Sessão expirada:** qualquer `401` em `/api/staff/*` volta ao login com `?expirou=1` (`useExpireOn401` em `api/session.ts`).
- **Cabeçalho (`app-header.tsx`):** público = marca (Início), "Rastreamento", "Atendimento 24h" (ponto âmbar) e o link discreto "Acesso colaborador" (cadeado; abre o login, ou a Torre com sessão). Na área com sessão = marca + "Área do colaborador", "Torre de controle", e-mail, "Sair" e "Voltar ao site". A Área do colaborador não aparece no menu público. Sem indicador "Conectado" (a consulta a `/api/health` saiu da tela em 17/11).
- **Rodapé (`app-footer.tsx`):** faixa baixa com o aviso de empresa fictícia, "Acesso colaborador" (páginas públicas) e "Desenvolvido por" + logo IPNET esmaecida (`public/ipnet.svg`).

### 13.3. Painel lateral do LogBot (`features/chat/logbot-dock.tsx`, `logbot-panel.ts`)

- Nas páginas do cliente (Início e Rastreamento), o LogBot fica à direita, ao lado do conteúdo (não por cima), com 400 px e a altura útil abaixo do cabeçalho (fixo ao rolar o Início). Não é botão flutuante.
- **Minimizar:** botão no cabeçalho do chat. O painel desliza para a direita (250 ms, largura + `transform`) e deixa uma aba fina vertical ("LogBot" + ícone) para reabrir; o conteúdo ocupa o espaço com a mesma transição. Sem animação com `prefers-reduced-motion` (`motion-safe:`).
- **Estado:** aberto por padrão; a escolha vale entre Início e Rastreamento e fica no `localStorage` (`translog.logbot.aberto`, leitura e escrita com `try/catch`). `askLogBot` reabre o painel quando a página pergunta ("Perguntar ao assistente", sugestões); "Perguntar ao LogBot" do Início abre e foca o campo.
- **Acessibilidade:** botões com `aria-expanded` e `aria-controls`; painel como região "Conversa com o LogBot"; o painel fechado fica `inert`; o foco vai para o campo ao reabrir e para a aba ao minimizar.
- **Mesma conversa** em todas as páginas do cliente: `use-chat-conversation.ts` fica no `App`, acima das rotas. Sem chat na Área do colaborador.

### 13.4. Cliente HTTP e consultas (`src/api/`)

- `client.ts`: `getJson`, `postJson` e `postNoContent` (para `204`), todos com `credentials: "same-origin"`; erro vira `ApiError` (`status: 0` = rede; envelope `{ error }` preservado; resposta fora do contrato = `INVALID_RESPONSE`).
- `queries.ts`: `useOrderSamples`, `useOrdersSummary` (mapa do Início), `useOrderQuery`, `useSendChatMessage` (sem retry).
- `session.ts`: `useSession` (`404` = sem sessão), `useLogin`, `useDemoLogin`, `useLogout`, `useTower`, `useStaffOrder`.

### 13.5. Formatação (`src/lib/format.ts`, `features/staff/tower-format.ts`)

- `formatDate` só corta o texto `AAAA-MM-DD` (nunca `new Date(texto)`); `formatCurrency` em `US$`.
- Área do colaborador: `formatInt`, `formatPercent` (pt-BR, 1 casa), `formatSignedDays`, `routeLabel` e `filterByStage` (filtro da fila de atenção), com testes.

### 13.6. Pedido na tela do cliente (`order-manifest-card.tsx`)

De cima para baixo: número, situação e prazo (sem o código de manifesto `TL-…`, interno, removido em 17/11); mensagem principal (`statusHeadline`); "Onde está agora" / local da entrega / extravio; aviso da central quando `escalateToSupport`; **Entrega** (previsto, realizado, atraso) em destaque e **Envio** numa frase simples (`dispatchSentence`: "O envio saiu com 1 dia de atraso.", "no prazo", "antes do previsto" ou por que não saiu); faixa "Motivo provável" em linguagem do cliente (vem pronta da API) com "Perguntar ao assistente"; rota (país e região, sem o mercado interno); linha do tempo por etapas (`stage-timeline.ts`, tabela de estados abaixo); itens.

| Estado | Quando | Visual |
|---|---|---|
| `done` | antes da etapa atual, ou pedido entregue | quadrado escuro, "Concluída" |
| `current` | etapa atual, em trânsito no prazo | azul, "Agora", caixa destacada |
| `delayed` | etapa atual, em trânsito com entrega atrasada | vermelho, "Agora · com atraso (+N dias)" |
| `lost` | etapa do extravio | vermelho, "Extraviado aqui" |
| `pending` | ainda não alcançada | tracejado, "Aguardando" |
| `not_reached` | depois de um extravio | tracejado claro, "Não alcançada" |

### 13.7. Chat (`src/features/chat/`)

- Respostas só da API (`POST /api/chat`); a regra do simulado vive em `api/src/chat/mock-agent.ts`. `sessionId` por conversa (UUID), pedido aberto como contexto, pedido citado abre o rastreio dele (a conversa continua, com o divisor `Alternado para o pedido #N`). Falha = "Tentar novamente" manual; `504` com texto próprio.
- Sugestões (`chat-suggestions.ts`): sem pedido, "Quero acompanhar meu pedido", modalidades e central; com pedido, 3 perguntas pela situação, e **"Quero falar com a central"** nos atrasados e extraviados.
- `rich-text.ts` mostra títulos, listas e negrito das respostas sem HTML.

### 13.8. Início (`features/home/`)

Herói em fundo claro com grade sutil (`.hero-grid`): sobretítulo, "Sua carga pelo mundo." + "Cada etapa visível." (âmbar), busca com a mesma validação do rastreio (vai para `/rastreio?pedido=N`) e os exemplos; à direita o **mapa animado** (`route-map.tsx`, animação do protótipo 01 em cores claras: rotas tracejadas que fluem de "EUA · Porto Rico" aos 5 mercados, azul → âmbar, com a contagem de pedidos de cada mercado vinda de `GET /api/orders/summary`; parado com `prefers-reduced-motion`). Abaixo: números (5 mercados, 4 modalidades, LogBot 24h, central seg–sex 9h–18h), como funciona (3 passos), as 4 modalidades com o prazo de despacho, central de atendimento com "Perguntar ao LogBot" e a linha "É da equipe TransLog? Acesso colaborador".

### 13.9. Área do colaborador (`features/staff/`)

- **Login (`staff-login-page.tsx`):** e-mail e senha; erro genérico ("E-mail ou senha inválidos."), aviso de `429`, aviso de sessão expirada; "Entrar como demonstração" só com `demoAvailable`.
- **Torre (`tower-page.tsx`):** cabeçalho com a data de referência e o total; 5 indicadores; "Pedidos que precisam de atenção" (12 primeiros + "Mostrar todos"; filtro por etapa com `aria-pressed`; o número do pedido é um link, então Tab + Enter abre, e a linha toda é clicável); promessa × realidade por modalidade com o prazo sugerido; em trânsito e extravios por etapa (selo "rastreio simulado"); rotas com mais atraso; "Painel completo de performance" (`dashboardUrl`) ou "link a definir", desabilitado.
- **Rastreio do colaborador (`staff-order-page.tsx`):** faixa escura "Visão do colaborador" (voltar à Torre, abrir outro pedido, "Ver como o cliente vê" em outra aba, para quem atende a central conferir a tela do cliente); blocos de diagnóstico (despacho prometido × real × sugerido, transporte padrão × real e dias recuperados, dias em cada etapa, contexto da modalidade e da rota, origem do dado com selos real/simulado, valor em risco, causas da base com a explicação completa, resumo para a IA e linha do tempo bruta recolhíveis); depois o cartão do pedido e os itens, sem o chat.

## 14. Testes

```bash
pnpm test                               # todos os testes (contracts, api e web; ~15 s com os CSVs presentes)
pnpm --filter @translog/api test        # só a API (1 de integração com o agente desligado)
pnpm --filter @translog/contracts test  # só o contrato
pnpm --filter @translog/web test        # só o frontend (~1 s)
```

Contagem em 16/11: contracts 20, api 294 (+2 desligados: agente real e Databricks real), web 69.

### Testes do contrato (`@translog/contracts`)

| Arquivo | Cobre |
|---|---|
| `orders.test.ts` | Pedido não pago e extraviado válidos, 7 situações, campos antigos fora do contrato, extras descartados, 16 casos inválidos (datas com hora, enums, etapa fora de 0 a 5, listas vazias) |

### Testes do Backend (`@translog/api`)

| Arquivo | Cobre |
|---|---|
| `config.test.ts` | Padrões, vazios, cada variável inválida (inclusive `AGENT*` e `DATABRICKS_*`), `DATA_DIR` relativo, `ORDERS_FILE` ignorada, barra final de `AGENT_URL`, host do Databricks (`https` ou `http` local), token nunca na mensagem, lista de erros completa |
| `server.test.ts` | Health (fixtures, file, databricks com o falso, pasta sem CSV, token recusado, modo do agente), formato de todos os erros, OpenAPI e Swagger UI |
| `chat/chat-service.test.ts` | Pedido citado existente e inexistente, primeiro número existente, pedido aberto inexistente ignorado, trava (mesma conversa → `ChatBusyError`; liberada depois de resposta e de falha; conversas diferentes em paralelo), resposta vazia, log sem conteúdo |
| `chat/mock-agent.test.ts` | Roteiro da banca (76902: por que, quando, onde, botão da tela), sem pedido (cumprimento, pede o número), modalidades, central (e se o pedido se enquadra), fora do escopo, pedido inexistente, as situações dos 9 pedidos, em trânsito no prazo, adiantado, aguardando pagamento, nenhuma causa comprovada nem tipo de pagamento, central só nos pedidos marcados pela API |
| `chat/routes.test.ts` | `200`, `400` (sem `sessionId`, UUID inválido, mensagem vazia, só espaços, 1001 caracteres, `orderId` inválido), mensagem aparada, `409`, `502`, `504` sem vazar detalhe, OpenAPI com exemplo |
| `chat/adk-events.test.ts` | Todos os casos de teste de `extract_final_text` + formatos inesperados, `error_code`, `function_call`/`function_response` |
| `chat/adk-agent.test.ts` | Contra um servidor HTTP falso: sessão, `409`, `404` → recria e reenvia uma vez, `500` → `502`, timeout → `504`, contexto do pedido no texto, expiração do `Map`. Integração com o agente real só com `AGENT_IT_URL` |
| `orders/routes.test.ts` | 76902 no contrato novo, os 9 fixtures sem alteração, 404, 400 (8 formatos), zeros à esquerda, samples, parâmetro no OpenAPI |
| `orders/fixtures-repository.test.ts` | Carga, situações e central dos 9 pedidos da demo, arquivo inválido, campos extras descartados |
| `orders/consumo-mapper.test.ts` | 375 completo e datas iguais à `linha_do_tempo`; 76902, 34, 9, 31298; linhas x unidades (8); fuso; formato do export; ordem de itens e eventos (10 depois de 9); centavos; "Sem atraso"; casos inválidos; colunas proibidas fora das lidas |
| `orders/escalation.test.ts` | ≥ 3 dias, 2 dias, extraviado, não pago, cancelado, adiantado |
| `orders/tower-stats.test.ts` | Torre com os fixtures (indicadores, fila de atenção, promessa × realidade, sem cenário, `DASHBOARD_URL`), resumo por mercado; **integração com os CSVs reais** (42,7%, 74,7%, 197/43/23, 8.337, 7.222) |
| `auth/auth-units.test.ts` | Hash scrypt (sal novo, formato), token HMAC (vencido, adulterado, outro segredo, malformado), limite de tentativas |
| `auth/routes.test.ts` | Login certo e errado (mesma resposta), atributos do cookie (`Secure` em produção), `429`, POST sem JSON, sem `STAFF_USERS`, sessão, `401` em `/api/staff/*`, Torre e pedido com sessão, cookie adulterado e vencido, logout, demonstração ligada e desligada |
| `orders/consumo-sql.test.ts` | SELECT explícito com `coalesce`/`date_format`, nenhuma coluna proibida (leitura e export), export ⊇ leitura, recusa de coluna proibida, schema e nome inválidos |
| `orders/databricks-client.test.ts` | Contra um servidor HTTP falso: corpo da consulta, token só na API e nunca no link pré-assinado, `PENDING` → `RUNNING` → `SUCCEEDED`, 3 pedaços com cabeçalho uma vez só, download em paralelo entregue em ordem, `401`/`403`, `FAILED` (tabela ausente), timeout com cancelamento, `404`, host inacessível, falha no download |
| `orders/databricks-repository.test.ts` | Contra o Databricks falso (`testing/fake-databricks.ts`, que serve a amostra e interpreta o `SELECT`): 9 pedidos iguais aos fixtures, 3 consultas sem colunas proibidas, token só na API, `PENDING` → `SUCCEEDED`, vários pedaços, log só com números, linha sem pedido, `401`, tabela ausente, timeout. **Integração com o Databricks real** só com `DATABRICKS_IT=1` (65.752 pedidos, 0 inválidas, 9 da demo iguais) |
| `orders/file-repository.test.ts` | Amostra igual aos fixtures, log, descarte de colunas nas 3 tabelas, linhas inválidas (id, repetido, curta, fora do contrato, sem pedido) sem conteúdo no log, limite de avisos, fora de ordem, BOM e CRLF, erros fatais; **integração com os CSVs reais** |
| `privacy.test.ts` | Seção 11 (pedidos e chat, nas três fontes; `databricks` com o falso) |

### Testes do Frontend (`@translog/web`)

| Arquivo | Cobre |
|---|---|
| `lib/format.test.ts` | Formatação `AAAA-MM-DD` → `DD/MM/AAAA` sem `new Date()`, moeda `US$` em `pt-BR` e pluralização de dias |
| `lib/url-state.test.ts` | Rejeição de IDs inválidos (`0`, `abc`, 11 dígitos) |
| `lib/router.test.ts` | Rotas, `/?pedido=N`, `?voltar=` sem redirecionamento aberto, `?expirou=1`, guarda, cabeçalho público × colaborador, destino de "Acesso colaborador", títulos |
| `api/client.test.ts` | `shouldRetry`, `ApiError`, `postJson` (corpo, `credentials`, `409`/`502`/`504`, fora do contrato), `postNoContent` (`204`, `429`) |
| `features/chat/logbot-panel.test.ts` | Painel aberto por padrão, escolha salva (e armazenamento bloqueado), reabrir ao perguntar |
| `features/home/markets.test.ts` | Nomes dos mercados e contagem em pt-BR |
| `features/staff/tower-format.test.ts` | Filtro por etapa, rota em texto, números e percentuais em pt-BR, dias com sinal |
| `features/staff/login-errors.test.ts` | Erro genérico do login, `429`, rede |
| `features/tracking/order-status.test.ts` | Mensagem principal das 7 situações (76902, 375, 34, 222, 8, 9, 50, aguardando, adiantado, no prazo), prazo de entrega, motivo da central |
| `features/tracking/stage-timeline.test.ts` | Etapas e estados: 76902 (alfândega com atraso), 76385 (voo com atraso), 375 (entregue), 34 (extravio + não alcançadas), 31298 (doméstica rodoviária sem voo nem alfândega), 8 (Porto Rico → Brasil), 9 e 50 (só o pedido), doméstica aérea, aguardando pagamento |
| `features/chat/chat-session.test.ts` | `sessionId` aceito pelo contrato, divisor na troca de pedido (sem repetir), texto de falha por status |
| `features/chat/chat-suggestions.test.ts` | Sem pedido, convida a informar o número; com pedido, sugestões por situação, sempre citando o número |
| `features/chat/rich-text.test.ts` | Negrito, listas (`*`, `-`, `•`, subníveis), títulos, linha em branco, asteriscos soltos |

Os testes da tela leem os pedidos de `api/src/orders/fixtures/orders.json` (`web/src/api/fixture-orders.ts`), o mesmo arquivo da API.

**Fixtures de teste da API**

- `orders/fixtures/orders.json`: os 9 pedidos da demo no formato `Order`.
- `orders/fixtures/consumo/*.csv`: as linhas reais dos 9 pedidos nas 3 tabelas (9 pedidos, 17 itens, 52 eventos), no formato dos CSVs do Mateus (timestamps ISO). Valores reais só nas colunas lidas; as 6 proibidas aparecem nas 3 tabelas com `FICTICIO-<coluna>-<n>` e as sem uso com `SEM-USO`. Regenerar: `pnpm --filter @translog/api fixtures` (lê `portal/dados/`).

**Integração com os CSVs reais:** roda só se `portal/dados/consumo_pedidos.csv` existir (`describe.skipIf`). Confere 65.752 pedidos, 0 linhas inválidas e os 9 pedidos dos `fixtures`.

**Integração com o Databricks real:** só com `DATABRICKS_IT=1 pnpm --filter @translog/api test databricks-repository` (3 consultas, gasta cota; credenciais do `portal/.env`). **Nenhum teste automatizado chama o Databricks**: os demais usam o servidor falso.

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
| `docker-compose.dados.yml` | Sobreposição: `DATA_SOURCE=file`, `DATA_DIR=/data`, volume `./dados:/data:ro` (substitui o `docker-compose.silver.yml`) |
| `docker-compose.databricks.yml` | Sobreposição: `DATA_SOURCE=databricks` e as `DATABRICKS_*` interpoladas do `portal/.env` (ou do ambiente) **na hora de subir**, com `${VAR:?mensagem}` para as obrigatórias; `start_period: 240s` (warehouse dormindo) |

**Credenciais fora da imagem:** a imagem não recebe nenhuma `DATABRICKS_*` no build; elas entram só como variáveis de ambiente do container. Conferido em 16/11: `docker image inspect` sem nenhuma `DATABRICKS_*` e o token ausente do log do container. Para validar o compose sem imprimir o token, use `docker compose -f docker-compose.yml -f docker-compose.databricks.yml config --quiet` (sem `--quiet`, o `config` mostra os valores).

**Verificado em 16/11:**

| Modo | Até ficar `healthy` | Pedidos / inválidas | Memória do container |
|---|---|---|---|
| fixtures | ~2 s | 9 / 0 | — |
| dados (CSVs) | 18 s | 65.752 / 0 | ~371 MiB |
| databricks | 40 s (consultas 1,8 s, download 23 s, leitura 10 s) | 65.752 / 0 | ~449 MiB |

**Chat no Docker sempre simulado:** o agente do Marco ainda não tem imagem na `main`, e, dentro do container da API, `AGENT_URL=http://127.0.0.1:8001` apontaria para o próprio container, não para a máquina. Quando o Dockerfile do agente estiver na `main`, ele entra como serviço no compose e a API usa `AGENT_URL=http://agent:8001`. Para testar com o agente, use `pnpm dev`.

**Por que sobreposições:** com o volume no `docker-compose.yml`, o Docker cria `portal/dados/` **como root** no host quando a pasta não existe (testado em 14/11). Em um clone novo no Linux, copiar os CSVs para lá passaria a exigir `sudo`. A sobreposição só monta o volume quando os CSVs são usados; a do Databricks só exige as credenciais quando ele é usado.

## 16. Como fazer mudanças comuns

**As tabelas `consumo_*` mudaram (coluna renomeada, nova ou removida)**
1. `orders/consumo-mapper.ts`: ajustar `ORDER_COLUMNS`/`ITEM_COLUMNS`/`EVENT_COLUMNS` e `mapConsumoOrder`; `orders/consumo-sql.ts`: ajustar `EXPORT_COLUMNS` (e `TIMESTAMP_COLUMNS`, se for data).
2. `pnpm export:dados` e depois `pnpm --filter @translog/api fixtures` (regenera `orders.json` e a amostra `fixtures/consumo/`).
3. Atualizar os testes do mapper e, se mudar o número de pedidos, o teste de integração.

**Campo novo no `Order`**
1. `contracts/src/orders.ts`: campo com `.describe()` em pt-BR (e caso em `orders.test.ts`).
2. `consumo-mapper.ts`: preencher o campo.
3. `pnpm --filter @translog/api fixtures` (a tela lê o mesmo `orders.json` nos testes).
4. Conferir se o campo não é sensível (seção 11).

**Trocar a regra da central (ex.: `> 3` em vez de `>= 3`)**
1. `orders/escalation.ts`: `SUPPORT_MIN_DELAY_DAYS` ou `shouldEscalateToSupport`; ajustar `escalation.test.ts` e regenerar os `fixtures`.

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
| A API devolve o view model `Order` pronto | A conversão das tabelas → `Order` fica num arquivo só (`consumo-mapper.ts`); a tela só exibe |
| Validação Zod também no cliente (`web/src/api/client.ts`) | Garante em tempo de execução que qualquer resposta recebida pela SPA respeita `@translog/contracts` |
| Formatação de datas por corte de texto (ou no SQL) na API e no Web | Evita `new Date(string)`, que em Brasília deslocaria horários de madrugada (UTC) para o dia anterior |
| Regras puras da tela (`order-status.ts`, `stage-timeline.ts`) | Separam do JSX a mensagem principal, as etapas da rota e o estado de cada uma, com testes unitários diretos |
| Carga completa antes do `listen` | Health honesto sem estado "carregando"; consulta O(1) em memória |
| Erros de domínio mapeados só em `http/errors.ts` | Status e mensagens num lugar; rotas sem `try/catch` |
| `orderId` como texto de 1 a 10 dígitos | Mesma regra do campo da tela; recusa `1e3` e `0x1F`, que `Number()` aceitaria |
| `DATA_DIR` relativo a `portal/` | O diretório de execução muda entre `pnpm dev`, `pnpm start` e testes |
| `csv-parse` com registros como arrays | ~30% mais rápido que objetos; o descarte das colunas é o mesmo |
| `Object.fromEntries`, grupos liberados e pool de textos | Memória da carga de 230 para 47 MB de heap (seção 8) |
| Docker em dois arquivos de compose | Evita a pasta `dados/` criada como root em clones novos |
| Tabelas `consumo_*` da Silver, carregadas no boot | A Gold é agregada; uma linha por pedido + itens + eventos cobre a tela, sem consulta por pedido (cota da edição gratuita) |
| Colunas explícitas no `SELECT` e `coalesce(CAST(...), '')` | Nada proibido sai do Databricks; NULL vira vazio como nos CSVs do Mateus |
| Regra da central numa função (`escalation.ts`) | O grupo ainda pode trocar `>= 3` por `> 3` |
| Chat sem histórico no servidor; porta `SupportAgent` recebe o pedido já resolvido | O ADK guarda a conversa; o simulado responde cada mensagem sozinho |
| Pedido citado detectado pelo portal, não pelo agente | Funciona nos dois modos e não depende do formato da resposta do agente |
| Trava por conversa marcada antes de qualquer `await` | O ADK exige uma mensagem por vez por sessão; `409 CHAT_BUSY` em vez de fila |
| Um limite de tempo por resposta (`AGENT_TIMEOUT_MS`, 90 s) | É o tempo que o cliente espera; cobre criação da sessão, `/run` e o reenvio após `404` |
| Reenvio automático só após `404` "Session not found" | Única situação em que a mensagem comprovadamente não foi processada |
| `withOrderContext` como único ponto que conhece o formato do contexto | O formato ainda depende do Marco |
| Regra do simulado só no backend | Uma cópia só; funciona com a base inteira, não só com os pedidos de exemplo |
| Log do chat sem conteúdo | Só metadados; o motivo técnico é montado pelo adapter, sem corpo HTTP |
| Chat no Docker sempre `mock` | O agente ainda não tem imagem na `main`; `127.0.0.1` no container é o próprio container |
| URL limpa por padrão no frontend (`/` sem query string inicial) | Evita poluir a barra de endereços ao abrir o portal; grava `?pedido=` apenas quando o cliente consulta um pedido |

## 19. Limitações e próximos passos

- **Sem atualização periódica:** os dados ficam como estavam ao subir a API (fora do escopo).
- **Nome do assistente e contato da central:** o nome (`ASSISTANT_NAME`) ainda não foi confirmado; o aviso da central mostra só o horário (sem telefone ou e-mail).
- **Agente ADK (pendências com o Marco, seção 10.8):** formato do pedido no texto, respostas longas e técnicas, formatação, sobreposição de mensagens depois de um `504`, Dockerfile na `main`. A tela e a API já funcionam com o agente; só `withOrderContext` e a configuração dependem dele.
- **Tela x chat no motivo provável:** com `AGENT=adk`, o agente lê a base dele; o portal agora lê `consumo_pedidos`, que tem a causa e o `resumo_pedido` feito para a IA. Ficam iguais quando o agente ler a mesma tabela (pendência com o Marco).
- **Docker do Frontend (Fase 4):** adicionar Dockerfile multi-stage de `@translog/web` (ou servir o `web/dist` pelo Fastify/Nginx) no `docker-compose.yml` para entrega final containerizada.
- **Fonte final (decidida em 16/11):** tabelas `consumo_*` da Silver no Databricks, com os CSVs em `portal/dados/` como plano B. Sem banco próprio.
