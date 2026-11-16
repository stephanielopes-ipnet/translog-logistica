# Portal de rastreamento TransLog

Parte do Desafio Final do Academy IPNET 2026, Grupo 3. Responsável: Matheus van Deursen (FullStack).

Este documento explica o portal para todo o grupo, de forma simples. Os detalhes técnicos estão em [docs/backend.md](docs/backend.md).

## O que é

O site em que o cliente da TransLog digita o número do pedido e vê, sem ligar para a central:

- a **situação** do pedido (entregue, em trânsito, extraviado, cancelado, não pago…);
- **onde ele está agora** e cada etapa da viagem (coleta, voo, alfândega, transferência, última milha);
- os prazos de **despacho** e de **entrega**, com o atraso de cada um;
- o **motivo provável** de um atraso (nunca como certeza);
- um **aviso da central de atendimento** quando o caso precisa dela (atraso de entrega de 3 dias ou mais, ou extravio; central de segunda a sexta, das 9h às 18h).

Ao lado, um **assistente** responde perguntas como "Por que meu pedido atrasou?".

A TransLog é uma operadora logística fictícia que despacha pedidos dos EUA e de Porto Rico para cinco mercados, em quatro modalidades (Standard Class, Second Class, First Class e Same Day). A dor central do projeto é a **promessa irreal**: o prazo de despacho das modalidades rápidas quase nunca é cumprido.

## De onde vêm os dados

Das tabelas oficiais do time de dados (Mateus), no Databricks:

| Tabela | O que tem |
|---|---|
| `workspace.silver.consumo_pedidos` | 1 linha por pedido (65.752): situação, prazos, causa, local atual |
| `workspace.silver.consumo_itens_pedido` | os itens de cada pedido, com o valor |
| `workspace.silver.consumo_eventos_logisticos` | os eventos da viagem (coleta, voo, alfândega…) |

O portal carrega tudo **uma vez, ao ligar**, e depois responde da memória. O "hoje" dos dados é **06/02/2018** (a data mais recente da base): a situação mostrada é a dessa data.

## Como rodar

Precisa de Node 24 e pnpm (`corepack enable`). Na pasta `portal/`:

```bash
pnpm install
pnpm dev        # tela em http://localhost:5173 e servidor em http://localhost:3333
```

A fonte dos dados é escolhida no arquivo `portal/.env` (copie de `.env.example`), pela variável `DATA_SOURCE`:

| Modo | O que usa | Quando usar |
|---|---|---|
| `fixtures` (padrão) | 9 pedidos de exemplo que vêm no código | Desenvolver a tela, testar sem nada instalado |
| `file` | as 3 tabelas em CSV na pasta `portal/dados/` | **Plano B da banca**: funciona sem internet e sem Databricks |
| `databricks` | as 3 tabelas direto do Databricks | A demonstração "oficial", com dados ao vivo |

### Com os exemplos (sem configurar nada)

```bash
pnpm dev
```

### Com os CSVs (plano B)

1. Coloque `consumo_pedidos.csv`, `consumo_itens_pedido.csv` e `consumo_eventos_logisticos.csv` em `portal/dados/`. Para baixá-los do Databricks: `pnpm export:dados` (leva ~1 min; precisa das credenciais abaixo).
2. No `portal/.env`: `DATA_SOURCE=file`.
3. `pnpm dev`. O servidor leva ~15 s para carregar os 65.752 pedidos.

### Direto do Databricks

1. No `portal/.env`:

   ```
   DATA_SOURCE=databricks
   DATABRICKS_HOST=dbc-xxxxxxxx-xxxx.cloud.databricks.com
   DATABRICKS_WAREHOUSE_ID=<id do SQL warehouse>
   DATABRICKS_TOKEN=<seu token>
   ```

2. `pnpm dev`. O servidor leva ~25 a 40 s para carregar (até 3 min se o warehouse estiver "dormindo").

Se o Databricks falhar (token vencido, sem internet, warehouse sem cota), o servidor **não liga** e a mensagem diz o que conferir e sugere `DATA_SOURCE=file`. A troca não é automática: quem opera escolhe.

**O token é segredo:** fica só no `portal/.env`, que nunca vai para o GitHub. Não cole o token em mensagens, documentos ou prints.

### Com Docker (só o servidor)

```bash
docker compose up --build                                                        # exemplos
docker compose -f docker-compose.yml -f docker-compose.dados.yml up --build      # CSVs
docker compose -f docker-compose.yml -f docker-compose.databricks.yml up --build # Databricks
docker compose down
```

Com o Databricks, as credenciais saem do `portal/.env` na hora de ligar o container e nunca entram na imagem. No Docker o assistente é sempre o simulado. A documentação interativa do servidor fica em http://localhost:3333/docs.

### O assistente

- `AGENT=mock` (padrão): assistente **simulado**, com respostas prontas a partir dos dados do pedido. Funciona sempre, sem IA, e é o plano B da banca.
- `AGENT=adk` com `AGENT_URL=http://127.0.0.1:8001`: o **agente de IA do Marco**, que precisa estar ligado.

O nome do assistente ("Assistente TransLog") ainda não foi confirmado pelo grupo; muda num lugar só.

## Roteiro da banca

1. Abrir o portal. O chat cumprimenta e pede o número do pedido.
2. Digitar **76902** (ou clicar no atalho): pedido **em trânsito**, First Class, de San Jose (EUA) para Jacarta (Indonésia), parado na **Alfândega Jacarta**, com **5 dias de atraso**. Motivo provável no despacho: **Promessa irreal**. Aviso da central.
3. Clicar em **"Perguntar ao assistente"** ("Por que o pedido #76902 atrasou?"). O assistente explica o motivo provável de cada etapa e avisa que o caso é acompanhado pela central.
4. Se a banca digitar outro número, qualquer um dos 65.752 pedidos funciona (com `file` ou `databricks`).

Pedidos de exemplo para mostrar cada situação:

| Pedido | Situação | Para mostrar |
|---|---|---|
| **76902** | Em trânsito, 5 dias de atraso, na alfândega | Pedido principal: promessa irreal, onde está, central |
| **375** | Entregue com 4 dias de atraso | Número que o grupo já conhece; central |
| **34** | Extraviado na alfândega | Extravio e central |
| **222** | Entregue com 1 dia de atraso | Promessa irreal sem central |
| **8** | Entregue no prazo | Caso feliz |
| **9** | Não pago (expirado) | Sem prazos, só o registro |
| **50** | Cancelado | Pedido encerrado |
| **31298** | Entregue no prazo, rota dentro dos EUA por caminhão | Sem voo nem alfândega |
| **76385** | Em trânsito, em voo para a Austrália, 6 dias de atraso | Outro caso em trânsito |

Os atalhos da tela são 76902, 375, 34 e 8 (`SAMPLE_ORDER_IDS`). A barra escura no topo da tela (some com `?bar=off` no endereço) abre qualquer um deles e simula carregamento, erro e conversas de exemplo.

## Privacidade

Nenhuma resposta do portal traz dados do cliente (id, segmento) nem valores internos (preço unitário, valor bruto, desconto, id do produto). Essas colunas **nem são lidas**: a consulta ao Databricks lista só as colunas permitidas, e a leitura dos CSVs descarta as demais. Testes automáticos conferem todas as respostas.

## Pontos em aberto

- Nome do assistente (citado "Login" na reunião de 16/11).
- Regra da central: "3 dias ou mais" (como está) ou "mais de 3 dias".
- Telefone ou e-mail da central para o aviso da tela.
- A explicação da base diz "cumprido em apenas 0.0%" (ponto decimal, número estranho): ajuste pedido ao Mateus.
- Agente do Marco lendo a mesma tabela (`consumo_pedidos` tem o `resumo_pedido`, feito para a IA).

## Glossário

| Termo | Significado |
|---|---|
| Despacho | Saída do pedido da expedição de origem. Cada modalidade promete um prazo (Standard 4 dias, Second 2, First 1, Same Day no mesmo dia) |
| Entrega | Chegada ao destinatário. Atraso de entrega = dias depois da data prevista |
| Motivo provável | Causa mais provável do atraso, vinda da base. Nunca é apresentada como certeza |
| Promessa irreal | Prazo de despacho que a operação quase nunca cumpre (First Class e Same Day) |
| Silver | Camada de dados tratados e traduzidos pelo time de dados, no Databricks |
| Data de referência | O "hoje" dos dados: 06/02/2018 |

## Pessoas ligadas ao portal

| Pessoa | Papel | Relação com o portal |
|---|---|---|
| Matheus van Deursen | FullStack | Responsável pelo portal (tela e servidor) |
| Mateus Maciel | Engenharia de Dados | Tabelas `consumo_*` no Databricks |
| Marco Aurélio | Engenharia de IA | Agente de IA que responde no chat (`AGENT=adk`) |
| Marcelo Pimenta | BI | Painel de gestão com os mesmos dados |
| Stephanie Lopes | Gestão de Projetos | Acompanhamento do projeto, FAQ da central e refinamento da tela |

## Onde está cada coisa nesta pasta

| Pasta ou arquivo | O que tem |
|---|---|
| `web/` | A tela (React) |
| `api/` | O servidor (Node + Fastify) e o assistente simulado |
| `contracts/` | O formato combinado dos dados entre tela e servidor |
| `dados/` | CSVs das tabelas (só no seu computador, nunca no GitHub) |
| `docs/backend.md` | Documentação técnica completa |
| `tasks.md` | Checklist do que foi feito |
| `prototipos/` | Protótipos visuais (a Direção D foi a escolhida) |
