# Portal de rastreamento TransLog

Portal em que o cliente da TransLog digita o número do pedido e vê a situação, o prazo, a rota e os itens, com um assistente de IA para tirar dúvidas (o chat chega numa próxima fase).

Esta pasta é um workspace pnpm com dois pacotes:

| Pacote | Pasta | Conteúdo |
|---|---|---|
| `@translog/api` | `api/` | API em Fastify + Zod, documentação OpenAPI em `/docs` |
| `@translog/contracts` | `contracts/` | Esquemas Zod compartilhados (contrato da API) |

## Rotas

| Rota | Resposta |
|---|---|
| `GET /api/health` | `{ status: "ok", dataSource, orders }`, só depois de os pedidos terem sido carregados |
| `GET /api/orders/samples` | Pedidos de exemplo da tela (`SAMPLE_ORDER_IDS`) que existem na fonte |
| `GET /api/orders/:orderId` | Pedido pronto para exibir; `404 ORDER_NOT_FOUND` ou `400 VALIDATION_ERROR` |
| `GET /docs` | Documentação OpenAPI (Swagger UI) |

Nenhuma resposta traz dados do cliente, de pagamento ou financeiros internos.

## Rodar com Docker (forma oficial)

Pré-requisito: Docker com Compose.

```bash
cd portal
docker compose up --build
```

A API sobe em `http://localhost:3333` com os pedidos de exemplo, sem nenhum arquivo externo. Para parar: `docker compose down`.

### Docker com a Silver

1. Coloque a Silver em `portal/dados/silver_pedidos_rastreio.csv` (a pasta está no `.gitignore`; o arquivo nunca vai para o Git nem para a imagem).
2. Suba com a sobreposição que monta `dados/` como volume somente leitura:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.silver.yml up --build
   ```

   Para não repetir os `-f`, descomente `COMPOSE_FILE` no `.env` (ver `.env.example`) e use só `docker compose up --build`.

A carga leva cerca de 10 s; o contêiner só fica saudável depois dela. O log mostra quantos pedidos foram carregados, quantas linhas foram ignoradas e o tempo.

## Rodar em desenvolvimento

Pré-requisitos: Node 24 (`nvm use` lê o `.nvmrc`) e pnpm via corepack (`corepack enable`).

```bash
cd portal
pnpm install
pnpm dev
```

A API sobe em `http://localhost:3333` e recarrega ao salvar. Sem `.env`, usa os pedidos de exemplo.

### Desenvolvimento com a Silver

```bash
cp .env.example .env
# no .env:
#   DATA_SOURCE=file
#   ORDERS_FILE=dados/silver_pedidos_rastreio.csv
pnpm dev
```

Caminho relativo em `ORDERS_FILE` parte da pasta `portal/`. Com `file`, cada recarga leva ~10 s; para mexer no código, `fixtures` é mais rápido.

## Configuração

Todas as variáveis estão explicadas em `.env.example`. Sem `.env`, os padrões funcionam. Valor inválido: a API não sobe e lista o que está errado.

| Variável | Padrão | Uso |
|---|---|---|
| `API_PORT` | `3333` | Porta da API |
| `DATA_SOURCE` | `fixtures` | `fixtures` ou `file` (no Docker, escolhido pelo arquivo de compose) |
| `ORDERS_FILE` | vazio | CSV da Silver, obrigatório com `file` |
| `SAMPLE_ORDER_IDS` | `15,375,562,1002` | Pedidos de exemplo da tela, na ordem |
| `NODE_ENV` | vazio | `production` = log em JSON |

## Pedidos de exemplo (`fixtures`)

Pedidos reais da Silver, só com os campos do contrato. Os quatro primeiros são os da demo.

| Pedido | Cenário |
|---|---|
| 15 | Entregue, 2 dias de atraso, sem motivo provável |
| 375 | Em Trânsito, atraso crítico, motivo provável de exemplo ("Promessa irreal") |
| 562 | Aguardando Liberação |
| 1002 | Cancelado (suspeita de fraude) |
| 10453 | Entregue no prazo (Europe) |
| 20322 | Entregue adiantado (Pacific Asia) |
| 31398 | Em Trânsito no prazo (USCA) |
| 225 | First Class atrasado |
| 41906 | Same Day atrasado (Africa) |
| 16 | Aguardando Liberação (pagamento pendente) |
| 552 | Cancelado pelo cliente |

O motivo provável do 375 só existe nos `fixtures`: a Silver ainda não tem essa coluna, então com `file` nenhum pedido mostra motivo provável.

## Comandos

```bash
pnpm test        # testes (Vitest); o teste com a Silver real só roda se portal/dados/ tiver o arquivo
pnpm lint        # Biome: lint e formatação (só verifica)
pnpm format      # Biome corrigindo o que for possível
pnpm typecheck   # tsc em todos os pacotes
```
