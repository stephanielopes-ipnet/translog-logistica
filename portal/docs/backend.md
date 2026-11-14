# Portal TransLog: documentação técnica (Backend e Frontend)

Para quem vai rodar, revisar ou mudar o código do portal. A visão geral, sem detalhes técnicos, está no [README](../README.md).

Estado em 14/11/2026: fases 0, 1 e 3 concluídas (fundação, contrato `@translog/contracts`, API de pedidos `@translog/api` e interface frontend `@translog/web` seguindo a Direção D). A integração HTTP de chat com o agente ADK (Fase 2) aguarda o acordo de contrato com o Marco. Checklist em [tasks.md](../tasks.md).

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
10. [Privacidade em camadas](#10-privacidade-em-camadas)
11. [Tratamento de erros](#11-tratamento-de-erros)
12. [Frontend (`@translog/web`)](#12-frontend-translogweb)
13. [Testes](#13-testes)
14. [Docker](#14-docker)
15. [Como fazer mudanças comuns](#15-como-fazer-mudanças-comuns)
16. [Convenções](#16-convenções)
17. [Decisões técnicas](#17-decisões-técnicas)
18. [Limitações e próximos passos](#18-limitações-e-próximos-passos)

## 1. Visão geral

O portal é um monorepo pnpm dividido em três pacotes:

- **`@translog/contracts` (`contracts/`)**: esquemas Zod compartilhados que definem o contrato HTTP, geram o OpenAPI em `/docs` e tipam tanto o backend quanto o frontend.
- **`@translog/api` (`api/`)**: API HTTP em Fastify que entrega à tela o pedido pronto para exibir (view model `Order`), lendo de 11 pedidos de exemplo versionados (`fixtures`) ou da base Silver em CSV (`file`). Tudo é carregado uma vez na inicialização e consultado em memória em $O(1)$.
- **`@translog/web` (`web/`)**: Single-Page Application em React 19 + Vite 8 + Tailwind CSS v4 que implementa o design da **Direção D** (estética de manifesto de carga internacional combinada com rota e linha do tempo de 4 etapas integradas) e consome a API real via `@tanstack/react-query`, validando todas as respostas no cliente com os esquemas de `@translog/contracts`.

```
Navegador (@translog/web, :5173)  ──►  API do portal (@translog/api, :3333)  ──►  Silver CSV / fixtures
        │                                       │
        └── Assistente local (mock Fase 3)      └──►  Agente ADK do Marco (Fase 2, futura)
```

A tela fala só com a API do portal (via proxy `/api` no Vite em desenvolvimento), nunca direto com o agente. A chave do Gemini fica restrita ao processo do agente.

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
| Vitest | 5.1.0 | `api`, `web` | Testes unitários e de integração (129 testes no total) |
| Biome | 2.6.7 | todos | Lint, formatação, acessibilidade e ordem dos imports |

Tamanho aproximado: ~950 linhas de código na API + ~2.200 linhas no frontend, cobertos por **129 testes automatizados** (105 na API + 24 no frontend).

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
│       ├── health.ts        # resposta do health, DataSource
│       └── errors.ts        # formato padrão de erro
├── api/                     # @translog/api
│   ├── Dockerfile
│   ├── vitest.config.ts     # isolate: false, TZ=America/Sao_Paulo
│   └── src/
│       ├── main.ts          # bootstrap: .env → config → servidor → listen
│       ├── server.ts        # Fastify, swagger, error handler, container, rotas (health inline)
│       ├── config.ts        # variáveis de ambiente validadas
│       ├── container.ts     # único lugar que escolhe o adapter de dados
│       ├── http/
│       │   └── errors.ts    # único lugar que transforma erros em resposta HTTP
│       ├── privacy.test.ts  # varredura de chaves e valores proibidos em todas as respostas
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
        │   ├── client.ts    # fetch + validação Zod com @translog/contracts + classe ApiError
        │   ├── fixtures.ts  # espelho dos 11 pedidos de exemplo para simulação offline via ProtoBar
        │   └── queries.ts   # hooks useHealth, useOrderSamples, useOrderQuery e política shouldRetry
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
            │   ├── mock-chat-service.ts   # motor determinístico do assistente (quando chega, por que atrasou, resumo)
            │   ├── chat-messages.tsx      # despachos numerados (#01), divisor de troca, typing e parser seguro de **negrito**
            │   ├── chat-input.tsx         # chips de sugestão contextual + textarea com Enter / Shift+Enter
            │   └── chat-panel.tsx         # coluna direita fixa (400 px) com contexto do pedido ativo
            └── dev-bar/
                └── proto-bar.tsx          # barra inferior recolhível para simular estados, decisões em aberto e tema
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
- `@translog/web` roda o servidor do Vite na porta `5173`, fazendo proxy automático de qualquer requisição `/api/*` para `http://127.0.0.1:3333` (ou para `VITE_API_TARGET`, se definida).

Sem `.env`, a API sobe com os `fixtures` (11 pedidos). Para usar a Silver real (65.752 pedidos), copie o arquivo para `portal/dados/silver_pedidos_rastreio.csv` e:

```bash
cp .env.example .env
# no .env:
#   DATA_SOURCE=file
#   ORDERS_FILE=dados/silver_pedidos_rastreio.csv
pnpm dev
```

Com `file`, cada recarga do `--watch` na API relê a Silver (~10 s).

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
| `pnpm test` | Roda o Vitest em todos os pacotes (129 testes: 105 na API + 24 no Web) |
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

### Camadas do backend (portas e adapters)

| Camada | Arquivo | Depende de |
|---|---|---|
| Rotas | `orders/routes.ts` | `OrderService` (interface) e esquemas do contrato |
| Serviço | `orders/order-service.ts` | `OrderRepository` (porta) |
| Porta | `orders/order-repository.ts` | Tipo `Order` do contrato |
| Adapters | `fixtures-repository.ts`, `file-repository.ts` | Porta, mapper, Node (fs, stream) |
| Composição | `container.ts` | Config e adapters: **único** lugar que escolhe a fonte |
| Erros → HTTP | `http/errors.ts` | Erros de domínio: **único** lugar que decide status e mensagem |

Padrão de código: funções fábrica (`createOrderService(deps)`), sem classes de serviço. Classes só para erros de domínio (`OrderNotFoundError` na API e `ApiError` no cliente HTTP do frontend).

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
| `healthResponseSchema`, `dataSourceSchema` | `{ status: "ok", dataSource: "fixtures" \| "file", orders }` |
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

## 6. API (`@translog/api`)

| Rota | Sucesso | Erros |
|---|---|---|
| `GET /api/health` | `200 { status: "ok", dataSource, orders }` | |
| `GET /api/orders/samples` | `200 { orderIds }`: ids de `SAMPLE_ORDER_IDS` que existem na fonte, na ordem configurada | |
| `GET /api/orders/:orderId` | `200 Order` | `400 VALIDATION_ERROR`, `404 ORDER_NOT_FOUND` |
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

## 7. Configuração

| Variável | Padrão | Uso |
|---|---|---|
| `API_PORT` | `3333` | Porta da API (1 a 65535) |
| `DATA_SOURCE` | `fixtures` | `fixtures` ou `file` |
| `ORDERS_FILE` | vazio | CSV da Silver; obrigatório com `file`. Caminho relativo parte de `portal/` |
| `SAMPLE_ORDER_IDS` | `15,375,562,1002` | Lista separada por vírgula; cada item inteiro positivo de até 10 dígitos; repetidos são removidos |
| `NODE_ENV` | vazio | `production` = log em JSON; ausente = legível (pino-pretty) |
| `VITE_API_TARGET` | `http://127.0.0.1:3333` | Alvo do proxy `/api` no Vite dev server (opcional, apenas para o frontend em dev) |

Regras (`api/src/config.ts`):

- Variável vazia conta como não definida (o compose repassa vazios).
- O `.env` fica em `portal/.env` e é lido com `process.loadEnvFile()` no `main.ts`, só se existir. Variáveis do ambiente têm prioridade. (Não usamos `node --env-file-if-exists`: com `--watch` e sem `.env`, o Node 24.21 aborta no Ctrl+C.)
- Valor inválido: a API não sobe e lista **todas** as variáveis com problema de uma vez, por exemplo:

  ```
  Configuração inválida:
    - SAMPLE_ORDER_IDS deve ser uma lista de números de pedido separados por vírgula (inteiros positivos de até 10 dígitos) (recebido: "15,x")
    - ORDERS_FILE é obrigatória com DATA_SOURCE=file: caminho do CSV da Silver (não definida)
  ```

- No Docker, `DATA_SOURCE` e `ORDERS_FILE` do `.env` não valem: a fonte é escolhida pelos arquivos de compose (seção 14).

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

## 10. Privacidade em camadas

Regra do projeto: nenhuma resposta traz dados do cliente, de pagamento ou financeiros internos.

1. **Leitura por lista de permitidas.** O adapter `file` copia só `SILVER_COLUMNS`. As colunas proibidas não chegam a nenhuma estrutura da aplicação.
2. **Contrato sem campos sensíveis.** `orderSchema` não tem esses campos. Os `fixtures` passam por ele ao carregar, o que descarta qualquer extra.
3. **Serialização pelo contrato.** O serializer do `fastify-type-provider-zod` passa a resposta por `safeEncode` do Zod, que descarta chaves fora do esquema, inclusive dentro de `items`.
4. **Testes** (`privacy.test.ts`):
   - varre todas as chaves, em qualquer nível, de todas as respostas (sucesso, erros, `/docs/json`), nas duas fontes;
   - confere que nenhuma resposta contém os valores fictícios das colunas proibidas (`FICTICIO-*`) e sem uso (`SEM-USO`) da amostra;
   - usa um repositório que devolve `id_cliente`, `lucro_item` etc. para provar a camada 3.
5. **Logs sem conteúdo.** Linhas e pedidos inválidos são logados só com número do registro, número do pedido e o nome dos campos.
6. **Silver fora do Git e da imagem.** `portal/dados/` está no `.gitignore` da raiz; o `.dockerignore` tira `dados/` e qualquer `*.csv`. No Docker, a Silver entra por volume somente leitura.

## 11. Tratamento de erros

Tudo em `http/errors.ts`. Rotas e serviços não têm `try/catch` para montar resposta.

| Origem | Status | `code` | `message` |
|---|---|---|---|
| `OrderNotFoundError` (serviço) | 404 | `ORDER_NOT_FOUND` | Pedido não encontrado. Confira o número e tente novamente. |
| Validação Zod (params, corpo) | 400 | `VALIDATION_ERROR` | `Requisição inválida: <campo>: <motivo>.` |
| JSON malformado | 400 | `VALIDATION_ERROR` | Requisição inválida. |
| Outros 4xx do Fastify | mesmo status | `BAD_REQUEST` | Mensagem genérica por status (ex.: 415 "Tipo de conteúdo não suportado.") |
| Rota inexistente | 404 | `NOT_FOUND` | Recurso não encontrado. |
| Qualquer outro erro | 500 | `INTERNAL_ERROR` | Ocorreu um erro inesperado. Tente novamente. (detalhe só no log) |

As mensagens de validação do Zod saem em pt-BR (`z.config(z.locales.ptBR())` no `server.ts`); um esquema pode trazer mensagem própria, como a do `orderId`.

## 12. Frontend (`@translog/web`)

A interface web foi construída em React 19 + Vite 8 + Tailwind CSS v4 implementando fielmente o protótipo **Direção D** (`portal/prototipos/translog-prototipo-direcao-d.html`).

### 12.1. Identidade visual e Design System (`src/index.css`)

- **Tipografia técnica dupla:**
  - `Inter Variable` (`--font-sans`, via `@fontsource-variable/inter`) para leitura fluida de títulos, rótulos principais e mensagens do assistente;
  - `IBM Plex Mono` (`--font-mono`) para códigos de manifesto (`TL-LATAM-000375`), datas, contagens de dias, preços em dólar e cabeçalhos rotulados (`.label-mono`).
  - Números tabulares forçados com `.tabular { font-variant-numeric: tabular-nums; }` para evitar deslocamento horizontal ao alternar pedidos.
- **Paleta e tokens (`@theme inline`):**
  - Azul-petróleo `#0F4C81` (`brand-800`) como cor primária de autoridade e foco;
  - Âmbar `#F59E0B` / `#D97706` reservado exclusivamente para atenção ("Motivo provável" e "Aguardando Liberação");
  - Vermelho (`red-600` / `red-50`) exclusivo para `deadlineStatus === "Atrasado"`;
  - Verde (`emerald-700` / `emerald-50`) para pedidos entregues, no prazo ou adiantados;
  - Neutros `slate` (tema claro padrão `#F8FAFC`, suporte opcional a tema escuro via `@custom-variant dark (&:where(.dark, .dark *))`).
- **Detalhes gráficos de manifesto internacional:**
  - `.perf-t`: divisor horizontal com serrilhado de manifesto logístico no rodapé de total da fatura;
  - `.route-line`: conector horizontal tracejado ligando a cidade de origem à cidade de destino no cabeçalho da rota.

### 12.2. Layout e estrutura de tela (`src/app.tsx`)

- **Desktop-first (`min-w-[1280px]`):**
  - **Cabeçalho (`AppHeader`, `h-14`):** marca TransLog, subtítulo técnico `INTERNATIONAL FREIGHT & WAYBILL TRACKING` e indicador de conexão que reflete `GET /api/health` (exibindo `Sistema online` ou `Sem conexão`).
  - **Coluna esquerda (`TrackingPanel`, `flex-1` ~60%):** área rolável com formulário de busca (`OrderSearchForm`), pílulas de pedidos de exemplo vindas de `GET /api/orders/samples` e o conteúdo do pedido (ou estados de vazio, skeleton, 404, 500 e offline).
  - **Coluna direita (`ChatPanel`, `w-[400px]` fixa na altura da viewport):** assistente TransLog como canal de atendimento oficial da operação, mostrando o badge do pedido ativo (`#375 · Em Trânsito` ou `Nenhum pedido aberto`), despachos numerados (`DESPACHO #01 · ASSISTENTE TRANSLOG`), chips de perguntas contextuais e caixa de envio.

### 12.3. Cliente HTTP, validação Zod e cache (`src/api/`)

- **`client.ts`:**
  - Toda chamada HTTP passa por `getJson(path, schema)`.
  - Se o `fetch` falhar na rede (`TypeError`), lança `ApiError` com `status: 0` e `code: "NETWORK_ERROR"`, ativando automaticamente o card de **Sem conexão com o servidor** na tela.
  - Se a resposta não for `2xx`, tenta decodificar o envelope `errorResponseSchema` (`@translog/contracts`) para preservar `code` (`ORDER_NOT_FOUND`, `VALIDATION_ERROR`, etc.) e `message` vindos do Fastify.
  - Se for `200 OK`, valida o corpo com `schema.safeParse(body)` usando o próprio esquema Zod de `@translog/contracts` (`orderSchema`, `orderSamplesResponseSchema`, `healthResponseSchema`). Respostas fora do contrato lançam `INVALID_RESPONSE`.
- **`queries.ts` (`@tanstack/react-query`):**
  - `useHealth()`: consulta `/api/health` com `staleTime: 30_000`.
  - `useOrderSamples()`: consulta `/api/orders/samples` e usa fallback `[15, 375, 562, 1002]` caso a API ainda não tenha respondido.
  - `useOrderQuery(orderId)`: consulta `/api/orders/:orderId` apenas quando `orderId !== null`.
  - `shouldRetry(failureCount, error)`: política testada unitariamente que **nunca repete erros 4xx** (`404 ORDER_NOT_FOUND` ou `400 VALIDATION_ERROR` falham na hora) e faz **1 retentativa rápida** em erros de rede (`status: 0`) ou `5xx`.

### 12.4. Formatação segura de datas e valores (`src/lib/format.ts`)

- **`formatDate(isoDate)`:** converte `"2015-01-08"` em `"08/01/2015"` operando exclusivamente por regex e corte de string (`/^(\d{4})-(\d{2})-(\d{2})/`), **sem jamais instanciar `new Date()`**. Isso garante que o frontend preserve a mesma regra de calendário do backend em qualquer fuso horário do navegador.
- **`formatCurrency(value)`:** usa `Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" })` para produzir `US$ 91,34`.
- **`formatManifestCode(order)`:** gera o código de etiqueta internacional no formato `TL-<MARKET>-<ORDER_ID_6_DIGITOS>` (ex.: `TL-LATAM-000375`, `TL-PAC-000562`).

### 12.5. Máquina de estados da linha do tempo (`src/features/tracking/timeline.ts`)

`buildTimelineSteps(order, releaseLabel)` recebe um `Order` e a variante de rótulo (`"waiting"` ou `"payment"`) e devolve as 4 etapas da jornada sem efeitos colaterais:

| Situação (`trackingStatus`) | Etapa 1 | Etapa 2 | Etapa 3 | Etapa 4 |
|---|---|---|---|---|
| **Aguardando Liberação** | Pedido recebido (`done`, `orderDate`) | Aguardando liberação / Pagamento pendente (`warn`, `Em análise`) | Em trânsito (`todo`, `Aguardando`) | Entregue (`todo`, `Prev. DD/MM/AAAA`) |
| **Em Trânsito** (no prazo) | Pedido recebido (`done`, `orderDate`) | Liberado e despachado (`done`, `Concluído`) | Em trânsito (`current`, `Rota ativa`) | Entregue (`todo`, `Prev. DD/MM/AAAA`) |
| **Em Trânsito** (atrasado) | Pedido recebido (`done`, `orderDate`) | Liberado e despachado (`done`, `Concluído`) | Em trânsito (`late`, `+N d atraso`) | Entregue (`todo`, `Prev. DD/MM/AAAA`) |
| **Entregue** | Pedido recebido (`done`, `orderDate`) | Liberado e despachado (`done`, `Concluído`) | Em trânsito (`done`, `Concluído`) | Entregue (`done`, `actualDeliveryDate`) |
| **Cancelado** | Pedido recebido (`done`, `orderDate`) | Liberado (`cancel`, `Interrompido`) | Em trânsito (`cancel`, `—`) | Cancelado (`cancel`, `Encerrado`) |

Quando `trackingStatus === "Cancelado"`, a quarta etapa muda o rótulo de `"Entregue"` para `"Cancelado"` e exibe um banner neutro informando que o envio foi encerrado sem previsão de entrega.

### 12.6. Assistente de IA e integração entre as duas colunas (`src/features/chat/`)

Enquanto o endpoint `POST /api/chat` (Fase 2) aguarda definição do contrato com o agente ADK, o frontend inclui o serviço determinístico `mock-chat-service.ts` com todas as regras de negócio e voz da TransLog:

- **Detecção automática de pedido no texto:** se o cliente digitar `"Onde está o pedido 375?"` (ou apenas `"375"`), `extractOrderNumberFromText` identifica o número; se o pedido existir na API ou nos fixtures, o portal abre automaticamente o pedido na coluna esquerda e responde já contextualizado.
- **Respostas contextuais (`buildAssistantReply`, `buildWhenReply`, `buildWhyReply`):**
  - Perguntas sobre **prazo** (`"quando chega"`, `"prazo"`, `"data"`): informa data prevista, data real (se entregue) e dias de atraso/adiantamento.
  - Perguntas sobre **causa de atraso** (`"por que atrasou"`, `"motivo"`, `"causa"`): explica o `probableCause` sempre como **motivo provável** (por exemplo, em `Promessa irreal`, detalha que o prazo estimado na modalidade `Second Class` foi curto para a rota internacional `San Benito → Saltillo`). Nunca afirma causa comprovada nem sugere rastreio em tempo real.
  - Botão **"Perguntar ao assistente"** dentro do alerta âmbar de Motivo Provável no `OrderManifestCard`: envia imediatamente a pergunta `"Por que o pedido #375 atrasou?"` para a coluna direita.
- **Renderização segura de formatação (`chat-messages.tsx`):** as respostas usam `**negrito**` apenas no dado principal; o componente `renderRichText` converte os segmentos em nós React `<strong>` sem usar `dangerouslySetInnerHTML`.
- **Três modos de histórico ao trocar de pedido (`chatOnSwitch`):**
  - `divider` (padrão recomendado): mantém o histórico da conversa e insere um divisor visual (`Agora falando sobre o pedido #375 · Em Trânsito`);
  - `keep`: mantém todas as mensagens sem divisor;
  - `clear`: limpa a conversa e cria uma saudação nova para o pedido selecionado.

### 12.7. Estado na URL e Barra de Apresentação (`src/lib/url-state.ts` e `ProtoBar`)

- **URL limpa por padrão:** ao abrir `http://localhost:5173`, a URL permanece limpa (`/`) e a tela abre no estado inicial vazio. Ao buscar um pedido, apenas `?pedido=<id>` é gravado via `window.history.replaceState` (se for o pedido padrão ou se limpar a busca, o parâmetro é removido).
- **Presets de demonstração por query string:** para testes ou apresentações guiadas, a URL também lê opcionalmente:
  - `?pedido=375` (ou `?order=375`): abre direto o pedido informado;
  - `?t=empty|loading|notfound|neterr|375`: força um estado de rastreamento;
  - `?c=normal|typing|err|empty`: força um estado do assistente;
  - `?s=keep|divider|clear`: escolhe o comportamento do chat ao trocar de pedido;
  - `?r=waiting|payment`: alterna o rótulo de `"Aguardando liberação"` vs `"Pagamento pendente"`;
  - `?n=on|off`: alterna tema claro/escuro;
  - `?bar=off`: oculta completamente a barra inferior.
- **Barra de demonstração (`ProtoBar`):** barra fixa no rodapé que permite testar ao vivo todos os estados de tela, alternar as 2 decisões de produto em aberto com o time e recolher a barra durante a apresentação para a banca.

## 13. Testes

```bash
pnpm test                         # todos os 129 testes (~12 s com a Silver presente)
pnpm --filter @translog/api test  # só a API (105 testes)
pnpm --filter @translog/web test  # só o frontend (24 testes, ~250 ms)
```

### Testes do Backend (`@translog/api` — 105 testes)

| Arquivo | Cobre |
|---|---|
| `config.test.ts` | Padrões, vazios, cada variável inválida, `ORDERS_FILE` relativo, lista de erros completa |
| `server.test.ts` | Health (fixtures, file, arquivo ausente), formato de todos os erros, OpenAPI e Swagger UI |
| `orders/routes.test.ts` | 200 (os 11 fixtures sem alteração), 404, 400 (8 formatos), zeros à esquerda, samples, parâmetro no OpenAPI |
| `orders/fixtures-repository.test.ts` | Carga, quatro situações da demo, arquivo inválido, campos extras descartados |
| `orders/silver-mapper.test.ts` | Pedido 375 completo, fuso, entrega por situação, `delayDays`, prefixo da janela, centavos, rota, 11 casos inválidos, colunas proibidas fora da lista lida |
| `orders/file-repository.test.ts` | Amostra igual aos mocks, log, descarte de colunas, linhas inválidas sem conteúdo no log, limite de avisos, itens fora de sequência, BOM, erros fatais; **integração com a Silver real** |
| `privacy.test.ts` | Seção 10 |

### Testes do Frontend (`@translog/web` — 24 testes)

| Arquivo | Cobre |
|---|---|
| `lib/format.test.ts` | Formatação `AAAA-MM-DD` → `DD/MM/AAAA` sem `new Date()`, moeda `US$` em `pt-BR`, código de manifesto (`TL-LATAM-000375`) e pluralização de dias |
| `lib/url-state.test.ts` | Leitura de `?pedido=375`, rejeição de IDs inválidos (`0`, `abc`), presets da `ProtoBar` e atualização limpa da query string |
| `api/client.test.ts` | `shouldRetry` (não repete 4xx, repete 1 vez em erro de rede ou 500) e tratamento de `ApiError` |
| `features/tracking/timeline.test.ts` | Máquina de estados das 4 etapas em todas as situações (`Entregue`, `Em Trânsito` atrasado/no prazo, `Aguardando Liberação` com variantes `waiting`/`payment`, e `Cancelado`) |
| `features/chat/mock-chat-service.test.ts` | Extração de número de pedido no texto, explicação de motivo provável sem certeza absoluta, resposta de prazo e sugestões contextuais |

**Fixtures de teste da API**

- `orders/fixtures/orders.json`: os 11 pedidos no formato `Order`.
- `orders/fixtures/silver-amostra.csv`: 15 linhas reais da Silver (pedidos 15, 375, 552, 562, 1002) com as 41 colunas. Valores reais só nas 21 colunas lidas; as proibidas têm `FICTICIO-<coluna>-<n>` e as sem uso, `SEM-USO`. O 552 está lá porque tem hora antes de 03:00Z (teste do fuso).

**Integração com a Silver real:** roda só se `portal/dados/silver_pedidos_rastreio.csv` existir (`describe.skipIf`). Confere 65.752 pedidos, 0 linhas inválidas e os 11 pedidos dos mocks. Com uma Silver nova, o número esperado precisa ser atualizado.

**Configuração do Vitest:** `isolate: false` (os testes não compartilham estado global) e `TZ=America/Sao_Paulo`. Rotas são testadas com `app.inject` (sem abrir porta). `buildServer(config, { logger: false, overrides })` aceita `overrides.orderRepository` para injetar um repositório nos testes.

## 14. Docker

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
| `docker-compose.yml` | Serviço `api` com `DATA_SOURCE=fixtures`, porta `${API_PORT:-3333}`, healthcheck em `/api/health` (`start_period: 60s`, `start_interval: 1s`) |
| `docker-compose.silver.yml` | Sobreposição: `DATA_SOURCE=file`, `ORDERS_FILE=/data/silver_pedidos_rastreio.csv`, volume `./dados:/data:ro` |

**Por que dois arquivos:** com o volume no `docker-compose.yml`, o Docker cria `portal/dados/` **como root** no host quando a pasta não existe (testado em 14/11). Em um clone novo no Linux, copiar a Silver para lá passaria a exigir `sudo`. A sobreposição só monta o volume quando a Silver é usada.

## 15. Como fazer mudanças comuns

**A Silver mudou (coluna renomeada, nova ou removida)**
1. `orders/silver-mapper.ts`: ajustar `SILVER_COLUMNS` e `mapSilverOrder`.
2. Regenerar `orders/fixtures/silver-amostra.csv` com o cabeçalho novo, mantendo valores fictícios fora das colunas lidas.
3. Atualizar os testes do mapper e, se mudar o número de pedidos, o teste de integração.

**Campo novo no `Order`** (ex.: `probableCause` passa a vir da base)
1. `contracts/src/orders.ts`: campo com `.describe()` em pt-BR.
2. `silver-mapper.ts`: preencher o campo.
3. `orders/fixtures/orders.json` e `web/src/api/fixtures.ts`: incluir o campo nos 11 pedidos.
4. Testes: `routes.test.ts` compara o pedido 15 campo a campo; ajustar.
5. Conferir se o campo não é sensível (seção 10).

**Conectar o chat do frontend ao endpoint real `POST /api/chat` (quando a Fase 2 estiver pronta)**
1. Definir `chatRequestSchema` e `chatResponseSchema` em `contracts/src/chat.ts` e reexportar em `contracts/src/index.ts`.
2. Adicionar `postJson("/api/chat", body, chatResponseSchema)` em `web/src/api/client.ts` e uma `useMutation` em `web/src/api/queries.ts`.
3. Em `web/src/app.tsx` (`sendQuestion`), substituir o timer local de `buildAssistantReply` pela mutação HTTP, mantendo `mock-chat-service.ts` apenas para os modos de simulação da `ProtoBar`.

**Fonte de dados nova** (ex.: Gold em Parquet)
1. Novo adapter em `orders/` que devolve um `OrderRepository`.
2. Novo valor em `dataSourceSchema` (`contracts/src/health.ts`) e variáveis em `config.ts` e `.env.example`.
3. Novo `case` em `createOrderRepository` (`container.ts`). Serviço e rotas não mudam.

**Rota ou módulo novo na API** (ex.: chat)
1. Pasta própria em `api/src/` (`chat/`), com `routes.ts`, serviço e porta.
2. Esquemas em `contracts/src/` e reexportação no `index.ts`.
3. Registro no `server.ts` e composição no `container.ts`.
4. Erros de domínio novos: classe no módulo e mapeamento em `http/errors.ts`.

## 16. Convenções

- Código, identificadores, arquivos e rotas em inglês. Mensagens da API, interface da tela, documentação e commits em pt-BR.
- Valores de dados como vêm da base, sem tradução (`Em Trânsito`, `Standard Class`, `LATAM`).
- TypeScript `strict`, sem `any` (Biome com `noExplicitAny: error`). Imports relativos com extensão `.ts`/`.tsx`; sem `enum` e `namespace`.
- Versões exatas (`savePrefix: ""`); versões compartilhadas no `catalog` do `pnpm-workspace.yaml`. O pnpm 12 só aceita versões publicadas há pelo menos 1 dia (`minimumReleaseAge`).
- Commits: `tipo(portal): descrição` (`feat`, `fix`, `test`, `docs`, `chore`). Comandos git só pelo responsável pelo portal.
- Antes de commitar: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Nada de abstração especulativa: só o que a fase atual usa.

## 17. Decisões técnicas

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
| URL limpa por padrão no frontend (`/` sem query string inicial) | Evita poluir a barra de endereços ao abrir o portal; grava `?pedido=` apenas quando o cliente consulta um pedido |

## 18. Limitações e próximos passos

- **Motivo provável na Silver:** com `DATA_SOURCE=file`, nenhum pedido tem `probableCause` (só os `fixtures` têm os motivos preenchidos, como `"Promessa irreal"` no pedido 375). Depende do Mateus e do Marcelo; quando a coluna existir, a mudança é apenas em `silver-mapper.ts`.
- **Chat no Backend (Fase 2):** contrato de `POST /api/chat` depende do acordo com o Marco (sessões do ADK, como o `orderId` chega ao agente, se o agente devolve o pedido citado). Quando fechado, o `ChatService` da API e a mutação HTTP em `@translog/web` substituirão o `mock-chat-service.ts`.
- **Duas decisões de produto em aberto (simuláveis na `ProtoBar`):**
  1. Comportamento do chat ao trocar de pedido (`divider` vs `keep` vs `clear`);
  2. Rótulo de pedidos com pagamento pendente (`Aguardando liberação` vs `Pagamento pendente`).
- **Docker do Frontend (Fase 4):** adicionar Dockerfile multi-stage de `@translog/web` (ou servir o `web/dist` pelo Fastify/Nginx) no `docker-compose.yml` para entrega final containerizada.
- **Fonte final:** Silver ou Gold (possivelmente Parquet) ainda não definida pelo grupo. Para Parquet, avaliar DuckDB no mesmo adapter. Sem banco de dados até o grupo decidir.
