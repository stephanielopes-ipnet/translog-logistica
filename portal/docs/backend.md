# Backend do portal: documentação técnica

Para quem vai rodar, revisar ou mudar o código do portal. A visão geral, sem detalhes técnicos, está no [README](../README.md).

Estado em 14/11/2026: fases 0 e 1 concluídas (fundação, contrato e API de pedidos). Chat, agente de IA e tela ainda não existem. Checklist em [tasks.md](../tasks.md).

## Sumário

1. [Visão geral](#1-visão-geral)
2. [Estrutura de pastas](#2-estrutura-de-pastas)
3. [Como rodar](#3-como-rodar)
4. [Fluxo: da inicialização à resposta](#4-fluxo-da-inicialização-à-resposta)
5. [Contrato (`@translog/contracts`)](#5-contrato-translogcontracts)
6. [API](#6-api)
7. [Configuração](#7-configuração)
8. [Fontes de dados](#8-fontes-de-dados)
9. [Mapeamento Silver → `Order`](#9-mapeamento-silver--order)
10. [Privacidade em camadas](#10-privacidade-em-camadas)
11. [Tratamento de erros](#11-tratamento-de-erros)
12. [Testes](#12-testes)
13. [Docker](#13-docker)
14. [Como fazer mudanças comuns](#14-como-fazer-mudanças-comuns)
15. [Convenções](#15-convenções)
16. [Decisões técnicas](#16-decisões-técnicas)
17. [Limitações e próximos passos](#17-limitações-e-próximos-passos)

## 1. Visão geral

API HTTP que entrega à tela o pedido pronto para exibir (o tipo `Order`, ou view model). Os pedidos vêm de uma de duas fontes, escolhida por configuração: 11 pedidos de exemplo versionados no código (`fixtures`) ou a Silver em CSV (`file`). Nos dois casos, tudo é carregado uma vez ao subir e consultado em memória.

```
Navegador (tela, futura)  ──►  API do portal (este backend)  ──►  Silver CSV / fixtures
                                       │
                                       └──►  Agente ADK do Marco (fase futura)
```

A tela fala só com esta API, nunca direto com o agente. A chave do Gemini fica no processo do agente.

### Stack

| Peça | Versão | Observação |
|---|---|---|
| Node.js | 24 (`engines` `>=24.11.0 <25`; imagem `node:24.22.3-alpine3.24`) | Executa o TypeScript direto, sem etapa de build |
| pnpm | 12.18.0 (via corepack) | Workspace com `catalog` de versões compartilhadas |
| TypeScript | 7.0.2 | `strict`, `noUncheckedIndexedAccess`, `erasableSyntaxOnly` |
| Fastify | 5.12.8 | Servidor HTTP |
| Zod | 4.6.7 | Esquemas do contrato, validação e tipos |
| fastify-type-provider-zod | 7.0.0 | Liga Zod ao Fastify (validação, serialização, OpenAPI) |
| @fastify/swagger + swagger-ui | 9.9.3 + 6.1.3 | OpenAPI em `/docs` |
| csv-parse | 7.0.3 | Leitura da Silver em streaming |
| Vitest | 5.1.0 | Testes |
| Biome | 2.6.7 | Lint, formatação e ordem dos imports |
| pino-pretty | 13.2.0 | Log legível em desenvolvimento (não vai para a imagem) |

Tamanho: ~950 linhas de código e ~1.050 de testes (105 testes).

## 2. Estrutura de pastas

`portal/` é a raiz do workspace pnpm. O resto do repositório (`agent/`, `pipeline/`, `bases/`, `dashboard/`, `docs/`) pertence a outras pessoas do grupo.

```
portal/
├── package.json             # scripts do workspace (dev, start, test, lint, format, typecheck)
├── pnpm-workspace.yaml      # pacotes (api, contracts), catalog de versões, savePrefix ""
├── pnpm-lock.yaml
├── tsconfig.base.json       # opções de TypeScript compartilhadas
├── biome.json               # ignora _contexto/, dados/, prototipos/ e *.md
├── .nvmrc                   # 24
├── .env.example             # todas as variáveis, comentadas
├── .dockerignore
├── docker-compose.yml       # API com fixtures
├── docker-compose.silver.yml  # sobreposição: API com a Silver por volume
├── README.md                # visão geral (não técnica)
├── CLAUDE.md                # regras e comandos para o assistente de código
├── tasks.md                 # checklist por fase
├── docs/backend.md          # este documento
├── prototipos/              # protótipos HTML da tela (referência de design)
├── dados/                   # cópia local da Silver (no .gitignore; nunca versionar)
├── contracts/               # @translog/contracts
│   └── src/
│       ├── index.ts         # reexporta tudo
│       ├── orders.ts        # Order, enums, params e resposta de samples
│       ├── health.ts        # resposta do health, DataSource
│       └── errors.ts        # formato padrão de erro
└── api/                     # @translog/api
    ├── Dockerfile
    ├── vitest.config.ts     # isolate: false, TZ=America/Sao_Paulo
    └── src/
        ├── main.ts          # bootstrap: .env → config → servidor → listen
        ├── server.ts        # Fastify, swagger, error handler, container, rotas (health inline)
        ├── config.ts        # variáveis de ambiente validadas
        ├── container.ts     # único lugar que escolhe o adapter de dados
        ├── http/
        │   └── errors.ts    # único lugar que transforma erros em resposta HTTP
        ├── privacy.test.ts  # varredura de chaves e valores proibidos em todas as respostas
        └── orders/
            ├── routes.ts              # GET /api/orders/samples e /api/orders/:orderId
            ├── order-service.ts       # regras de consulta + OrderNotFoundError
            ├── order-repository.ts    # porta OrderRepository + repositório em memória
            ├── fixtures-repository.ts # adapter fixtures
            ├── file-repository.ts     # adapter file (Silver CSV em streaming)
            ├── silver-mapper.ts       # linhas da Silver → Order (único arquivo que conhece a Silver)
            └── fixtures/
                ├── orders.json        # 11 pedidos de exemplo (vão para a imagem)
                └── silver-amostra.csv # amostra da Silver para testes (não vai para a imagem)
```

Testes ficam ao lado do arquivo testado (`*.test.ts`).

## 3. Como rodar

### Pré-requisitos

- Node 24 (`nvm use` lê o `.nvmrc`) e `corepack enable` (ativa o pnpm 12.18.0 fixado no `package.json`).
- Para Docker: Docker Engine 25 ou mais novo, com Compose (o healthcheck usa `start_interval`).

### Desenvolvimento

```bash
cd portal
pnpm install
pnpm dev            # node --watch: recarrega ao salvar; API em http://localhost:3333
```

Sem `.env`, sobe com os `fixtures`. Para usar a Silver, copie o arquivo para `portal/dados/silver_pedidos_rastreio.csv` e:

```bash
cp .env.example .env
# no .env:
#   DATA_SOURCE=file
#   ORDERS_FILE=dados/silver_pedidos_rastreio.csv
pnpm dev
```

Com `file`, cada recarga do `--watch` relê a Silver (~10 s).

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
| `pnpm dev` | API com `node --watch` |
| `pnpm start` | API sem watch |
| `pnpm test` | Vitest em todos os pacotes |
| `pnpm lint` | Biome (só verifica) |
| `pnpm format` | Biome corrigindo |
| `pnpm typecheck` | `tsc` em todos os pacotes |
| `pnpm --filter @translog/api <script>` | Um pacote só |

## 4. Fluxo: da inicialização à resposta

### Inicialização

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

Qualquer falha até o `listen` (variável inválida, arquivo ausente, porta ocupada) cai no `catch` do `bootstrap()`: a mensagem vai para o stderr e o processo sai com código 1. Como a carga acontece antes do `listen`, `/api/health` nunca responde antes de os pedidos estarem prontos. Não existe estado "carregando".

`SIGINT` e `SIGTERM` fecham o Fastify e saem com código 0.

### Consulta de um pedido

```
GET /api/orders/375
 ├─ params validados por orderIdParamsSchema ─────── falha → 400 VALIDATION_ERROR
 ├─ orderService.getOrder(375)
 │   └─ orders.findById(375)                         Map em memória, O(1)
 │       └─ null → throw OrderNotFoundError ──────── http/errors.ts → 404 ORDER_NOT_FOUND
 └─ resposta serializada por orderSchema             campos fora do contrato são descartados → 200
```

### Camadas (portas e adapters)

| Camada | Arquivo | Depende de |
|---|---|---|
| Rotas | `orders/routes.ts` | `OrderService` (interface) e esquemas do contrato |
| Serviço | `orders/order-service.ts` | `OrderRepository` (porta) |
| Porta | `orders/order-repository.ts` | Tipo `Order` do contrato |
| Adapters | `fixtures-repository.ts`, `file-repository.ts` | Porta, mapper, Node (fs, stream) |
| Composição | `container.ts` | Config e adapters: **único** lugar que escolhe a fonte |
| Erros → HTTP | `http/errors.ts` | Erros de domínio: **único** lugar que decide status e mensagem |

Padrão de código: funções fábrica (`createOrderService(deps)`), sem classes de serviço. Classes só para erros de domínio.

## 5. Contrato (`@translog/contracts`)

Pacote só com código-fonte (`exports` → `src/index.ts`, sem build). Os esquemas Zod:

- validam a entrada da API (params) e a saída (serialização);
- geram o OpenAPI de `/docs`, com as descrições em pt-BR que estão nos `.describe()`;
- geram os tipos TypeScript (`z.infer`), que a tela vai importar quando existir.

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

## 6. API

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
| `API_PORT` | `3333` | Porta (1 a 65535) |
| `DATA_SOURCE` | `fixtures` | `fixtures` ou `file` |
| `ORDERS_FILE` | vazio | CSV da Silver; obrigatório com `file`. Caminho relativo parte de `portal/` |
| `SAMPLE_ORDER_IDS` | `15,375,562,1002` | Lista separada por vírgula; cada item inteiro positivo de até 10 dígitos; repetidos são removidos |
| `NODE_ENV` | vazio | `production` = log em JSON; ausente = legível (pino-pretty) |

Regras (`api/src/config.ts`):

- Variável vazia conta como não definida (o compose repassa vazios).
- O `.env` fica em `portal/.env` e é lido com `process.loadEnvFile()` no `main.ts`, só se existir. Variáveis do ambiente têm prioridade. (Não usamos `node --env-file-if-exists`: com `--watch` e sem `.env`, o Node 24.21 aborta no Ctrl+C.)
- Valor inválido: a API não sobe e lista **todas** as variáveis com problema de uma vez, por exemplo:

  ```
  Configuração inválida:
    - SAMPLE_ORDER_IDS deve ser uma lista de números de pedido separados por vírgula (inteiros positivos de até 10 dígitos) (recebido: "15,x")
    - ORDERS_FILE é obrigatória com DATA_SOURCE=file: caminho do CSV da Silver (não definida)
  ```

- No Docker, `DATA_SOURCE` e `ORDERS_FILE` do `.env` não valem: a fonte é escolhida pelos arquivos de compose (seção 13).

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
5. **Logs sem conteúdo.** Linhas e pedidos inválidos são logados só com número do registro, número do pedido e nome dos campos.
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

## 12. Testes

```bash
pnpm test                         # todos (~12 s com a Silver presente: o teste de integração lê o arquivo inteiro)
pnpm --filter @translog/api test  # só a API
```

| Arquivo | Cobre |
|---|---|
| `config.test.ts` | Padrões, vazios, cada variável inválida, `ORDERS_FILE` relativo, lista de erros completa |
| `server.test.ts` | Health (fixtures, file, arquivo ausente), formato de todos os erros, OpenAPI e Swagger UI |
| `orders/routes.test.ts` | 200 (os 11 fixtures sem alteração), 404, 400 (8 formatos), zeros à esquerda, samples, parâmetro no OpenAPI |
| `orders/fixtures-repository.test.ts` | Carga, quatro situações da demo, arquivo inválido, campos extras descartados |
| `orders/silver-mapper.test.ts` | Pedido 375 completo, fuso, entrega por situação, `delayDays`, prefixo da janela, centavos, rota, 11 casos inválidos, colunas proibidas fora da lista lida |
| `orders/file-repository.test.ts` | Amostra igual aos mocks, log, descarte de colunas, linhas inválidas sem conteúdo no log, limite de avisos, itens fora de sequência, BOM, erros fatais; **integração com a Silver real** |
| `privacy.test.ts` | Seção 10 |

**Fixtures de teste**

- `orders/fixtures/orders.json`: os 11 pedidos no formato `Order`.
- `orders/fixtures/silver-amostra.csv`: 15 linhas reais da Silver (pedidos 15, 375, 552, 562, 1002) com as 41 colunas. Valores reais só nas 21 colunas lidas; as proibidas têm `FICTICIO-<coluna>-<n>` e as sem uso, `SEM-USO`. O 552 está lá porque tem hora antes de 03:00Z (teste do fuso).

**Integração com a Silver real:** roda só se `portal/dados/silver_pedidos_rastreio.csv` existir (`describe.skipIf`). Confere 65.752 pedidos, 0 linhas inválidas e os 11 pedidos dos mocks. Com uma Silver nova, o número esperado precisa ser atualizado.

**Configuração do Vitest:** `isolate: false` (os testes não compartilham estado global) e `TZ=America/Sao_Paulo`. Rotas são testadas com `app.inject` (sem abrir porta). `buildServer(config, { logger: false, overrides })` aceita `overrides.orderRepository` para injetar um repositório nos testes.

## 13. Docker

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

## 14. Como fazer mudanças comuns

**A Silver mudou (coluna renomeada, nova ou removida)**
1. `orders/silver-mapper.ts`: ajustar `SILVER_COLUMNS` e `mapSilverOrder`.
2. Regenerar `orders/fixtures/silver-amostra.csv` com o cabeçalho novo, mantendo valores fictícios fora das colunas lidas.
3. Atualizar os testes do mapper e, se mudar o número de pedidos, o teste de integração.

**Campo novo no `Order`** (ex.: `probableCause` passa a vir da base)
1. `contracts/src/orders.ts`: campo com `.describe()` em pt-BR.
2. `silver-mapper.ts`: preencher o campo.
3. `orders/fixtures/orders.json`: incluir o campo nos 11 pedidos (a carga dos fixtures falha sem ele).
4. Testes: `routes.test.ts` compara o pedido 15 campo a campo; ajustar.
5. Conferir se o campo não é sensível (seção 10).

**Fonte de dados nova** (ex.: Gold em Parquet)
1. Novo adapter em `orders/` que devolve um `OrderRepository`.
2. Novo valor em `dataSourceSchema` (`contracts/src/health.ts`) e variáveis em `config.ts` e `.env.example`.
3. Novo `case` em `createOrderRepository` (`container.ts`). Serviço e rotas não mudam.

**Rota ou módulo novo** (ex.: chat)
1. Pasta própria em `api/src/` (`chat/`), com `routes.ts`, serviço e porta.
2. Esquemas em `contracts/src/` e reexportação no `index.ts`.
3. Registro no `server.ts` e composição no `container.ts`.
4. Erros de domínio novos: classe no módulo e mapeamento em `http/errors.ts`.

## 15. Convenções

- Código, identificadores, arquivos e rotas em inglês. Mensagens da API, documentação e commits em pt-BR.
- Valores de dados como vêm da base, sem tradução (`Em Trânsito`, `Standard Class`, `LATAM`).
- TypeScript `strict`, sem `any` (Biome com `noExplicitAny: error`). Imports relativos com extensão `.ts`; sem `enum` e `namespace`.
- Versões exatas (`savePrefix: ""`); versões compartilhadas no `catalog` do `pnpm-workspace.yaml`. O pnpm 12 só aceita versões publicadas há pelo menos 1 dia (`minimumReleaseAge`).
- Commits: `tipo(portal): descrição` (`feat`, `fix`, `test`, `docs`, `chore`). Comandos git só pelo responsável pelo portal.
- Antes de commitar: `pnpm lint`, `pnpm typecheck`, `pnpm test`.
- Nada de abstração especulativa: só o que a fase atual usa.

## 16. Decisões técnicas

| Decisão | Motivo |
|---|---|
| Node 24 executando TypeScript, sem build | Dispensa `tsx`, bundler e `dist/` |
| A API devolve o view model `Order` pronto | A conversão Silver → `Order` fica num arquivo só (`silver-mapper.ts`); a tela só exibe |
| Carga completa antes do `listen` | Health honesto sem estado "carregando"; consulta O(1) em memória |
| Erros de domínio mapeados só em `http/errors.ts` | Status e mensagens num lugar; rotas sem `try/catch` |
| `orderId` como texto de 1 a 10 dígitos | Mesma regra do campo da tela; recusa `1e3` e `0x1F`, que `Number()` aceitaria |
| `ORDERS_FILE` relativo a `portal/` | O diretório de execução muda entre `pnpm dev`, `pnpm start` e testes |
| `csv-parse` com registros como arrays | ~30% mais rápido que objetos; o descarte das colunas é o mesmo |
| `Object.fromEntries`, grupos liberados e pool de textos | Memória da carga de 230 para 47 MB de heap (seção 8) |
| Docker em dois arquivos de compose | Evita a pasta `dados/` criada como root em clones novos |
| `probableCause` sempre `null` vindo da Silver | A coluna não existe; nada de regra inventada no backend |

## 17. Limitações e próximos passos

- **Motivo provável:** com `DATA_SOURCE=file`, nenhum pedido tem `probableCause` (só os `fixtures` têm o exemplo do 375). Depende do Mateus e do Marcelo; quando a coluna existir, a mudança é em `silver-mapper.ts`.
- **Chat:** contrato de `POST /api/chat` depende do acordo com o Marco (sessões do ADK, como o `orderId` chega ao agente, se o agente devolve o pedido citado). Plano: `ChatService` com uma mensagem por vez por sessão (`409`), histórico em memória com limite, agente mock com as regras do protótipo e, depois, adapter ADK.
- **Tela React** (`portal/web`): depois do design fechado no protótipo HTML. Vai importar os tipos de `@translog/contracts`.
- **Fonte final:** Silver ou Gold (possivelmente Parquet) ainda não definida pelo grupo. Para Parquet, avaliar DuckDB no mesmo adapter. Sem banco de dados até o grupo decidir.
- **Boot com a Silver** em ~10 s e RSS em ~350 MB: aceitáveis para a demo; `papaparse` é a opção medida se for preciso melhorar (seção 8).
