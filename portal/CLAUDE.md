# Portal de rastreamento TransLog

## Contexto

Projeto Integrador do IPNET Academy 2026, grupo 3. Banca em 23/11/2026; code freeze em 19/11.

Cliente fictício: **TransLog**, operadora logística internacional. Despacha pedidos de e-commerce a partir dos EUA e de Porto Rico para cinco mercados, em quatro níveis de serviço (Standard Class, Second Class, First Class, Same Day). Dor central: promessa de prazo irreal nas modalidades rápidas.

Esta pasta é o **portal**, com três áreas: **Início** (busca, mapa animado, modalidades, central), **Rastreamento** (o cliente digita o número do pedido, vê situação, prazo e motivo provável em linguagem dele, e conversa com o LogBot num painel lateral minimizável) e **Área do colaborador** (login; Torre de controle e visão do colaborador de cada pedido, com o diagnóstico). Responsável: Matheus (FullStack). O resto do repositório é de outras pessoas do grupo: `agent/` (Marco, agente ADK em Python), `pipeline/` e `bases/` (Mateus, dados), `dashboard/` (Marcelo, BI).

Contexto detalhado, decisões e pendências ficam em `portal/_contexto/` (local, fora do Git): leia `databricks.md`, `decisoes.md`, `pendencias.md`, `projeto.md` e `backend-analise.md` antes de mudar contrato ou arquitetura.

Dados (16/11): tabelas oficiais `workspace.silver.consumo_pedidos`, `consumo_itens_pedido` e `consumo_eventos_logisticos` (Databricks), carregadas uma vez ao subir a API (`DATA_SOURCE=databricks`). Plano B: as mesmas tabelas em CSV em `portal/dados/` (`DATA_SOURCE=file`), atualizáveis com `pnpm export:dados`. Sem fallback automático: quem opera escolhe a fonte. "Hoje" da base = `data_referencia_base` (2018-02-06).

## Regras

- **Git só pelo humano.** Não rode `git add`, `commit`, `branch`, `push`, `rebase`, `stash` nem similares. Ao fim de cada tarefa: `pnpm lint`, `pnpm typecheck`, `pnpm test`, marque o `tasks.md`, sugira a mensagem de commit e pare.
- **Não altere** `agent/`, `pipeline/`, `bases/`, `dashboard/`, `docs/` da raiz. O `.gitignore` da raiz só muda com autorização.
- `portal/_contexto/` e `portal/dados/` nunca vão para o Git. Confira com `git status` antes de sugerir commit.
- **Nenhum arquivo com "token" no nome:** o `.gitignore` da raiz ignora `*token*` e o arquivo some do Git sem aviso (aconteceu com `auth/session-token.ts`, renomeado em 18/11). Antes de sugerir commit, `git ls-files --others --ignored --exclude-standard .` não pode listar nada fora de `node_modules/`, `dados/`, `_contexto/`, `dist/` e `.env`.
- **Privacidade:** nenhuma resposta da API contém id do cliente, segmento, tipo de pagamento, preço unitário, valor bruto, desconto, id do produto, lucro, margem ou latitude/longitude. Nas tabelas `consumo_*`, `id_cliente`, `segmento_cliente`, `valor_desconto`, `valor_bruto_venda`, `preco_unitario` e `id_produto` nunca entram no `SELECT` e são descartadas **na leitura** dos CSVs, não só na saída.
- Os CSVs (`portal/dados/consumo_*.csv`) nunca entram no Git nem na imagem Docker. Fixtures de teste em CSV usam valores reais só nas colunas que o portal lê; as proibidas recebem valores fictícios (`FICTICIO-*`).
- **`SESSION_SECRET` e `STAFF_USERS`** só no `portal/.env` (nunca no código, testes, docs ou log; a mensagem de configuração inválida não mostra o valor).
- **Token do Databricks** só no `portal/.env`: nunca no código, nos testes, nos fixtures, nos logs, na documentação, na imagem Docker ou no navegador. A mensagem de configuração inválida nunca mostra o valor dele. Testes automatizados não chamam o Databricks (usam `api/src/testing/fake-databricks.ts`); o teste real só com `DATABRICKS_IT=1`.
- Nada de abstração especulativa: só o que a fase atual usa (sem histórico no servidor, streaming ou rate limit no chat).
- **Chat:** decidido em 15/11 seguir sem esperar o acordo com o Marco. O que depende dele fica isolado em `withOrderContext` (`api/src/chat/adk-agent.ts`) e na configuração (`AGENT*`). Não altere `portal/_contexto/teste-agente/agent/` (cópia do código dele).
- **Chave do Gemini** só no `.env` do agente: nunca no portal, no código, nos testes, nos logs ou no navegador. Testes automatizados não chamam o Gemini.
- **Log do chat sem conteúdo:** nunca registre a mensagem do cliente nem a resposta; só sessão, tamanho, modo do agente, tempo e resultado.
- Conflito entre um pedido do humano e o plano: faça o que foi pedido, atualize `portal/_contexto/` e destaque o conflito.

## Comandos

```bash
pnpm install                     # Node 24 (nvm use) e corepack enable
pnpm dev                         # API em localhost:3333 e Web em localhost:5173 (recarregam ao salvar)
pnpm build                       # bundle de produção do frontend em web/dist/
pnpm test                        # testes (Vitest) na API e no Web
pnpm lint                        # Biome: lint, formatação e ordem dos imports (só verifica)
pnpm format                      # Biome corrigindo o que for possível
pnpm typecheck                   # tsc em todos os pacotes
pnpm --filter @translog/api test # um pacote só (api ou web)
AGENT_IT_URL=http://127.0.0.1:8001 pnpm --filter @translog/api test adk-agent  # teste com o agente real (gasta cota do Gemini)
DATABRICKS_IT=1 pnpm --filter @translog/api test databricks-repository        # teste com o Databricks real (3 consultas, gasta cota)
pnpm export:dados                # baixa as tabelas consumo_* e o cenário da Gold do Databricks para portal/dados/ (1 a 5 min)
pnpm staff:add <email>           # pede a senha (sem eco) e imprime a linha STAFF_USERS para o .env
pnpm --filter @translog/api fixtures  # regenera os fixtures e a amostra de teste a partir de portal/dados/
docker compose up --build        # forma oficial de rodar a API (fixtures, chat simulado)
docker compose -f docker-compose.yml -f docker-compose.dados.yml up --build       # com os CSVs consumo_*
docker compose -f docker-compose.yml -f docker-compose.databricks.yml up --build  # direto do Databricks (credenciais do .env, nunca na imagem)
docker compose down
```

Pacotes: `@translog/api` (`api/`), `@translog/contracts` (`contracts/`, com testes do contrato) e `@translog/web` (`web/`). Tela em `http://localhost:5173`; documentação da API em `http://localhost:3333/docs`.

Área do colaborador: `STAFF_USERS` (de `pnpm staff:add`) e `SESSION_SECRET` (32+ caracteres) no `portal/.env`; `AUTH_DEMO=true` liga "Entrar como demonstração" (dev e banca). `DASHBOARD_URL` = link do painel na Torre (vazio = "link a definir").

Chat: `AGENT=mock` (padrão, simulado na própria API) ou `AGENT=adk` com `AGENT_URL=http://127.0.0.1:8001` (agente do Marco) no `portal/.env`, que fica fora do Git. Reinicie o `pnpm dev` depois de mudar o `.env`. No Docker, sempre `mock`.

## Arquitetura

Documentação técnica completa em `docs/backend.md` (mantenha atualizada ao mudar estrutura, contrato, configuração ou Docker). O `README.md` é a visão geral para o time, em linguagem não técnica.

- O Node 24 executa o TypeScript direto (sem build): imports relativos com `.ts`, sem `enum`/`namespace` (`erasableSyntaxOnly`).
- `contracts/` tem os esquemas Zod: validam entrada e saída da API, geram o OpenAPI e os tipos (`z.infer`).
- `api/src/`: `main.ts` (bootstrap), `server.ts` (Fastify, swagger, rotas), `config.ts` (variáveis validadas no boot), `container.ts` (**único** lugar que escolhe adapters), `http/errors.ts` (**único** lugar que transforma erros em HTTP).
- Código agrupado por funcionalidade (`orders/`, `chat/`), com porta e adapters. Funções fábrica (`createX(deps)`), sem classes de serviço.
- Duas visões do pedido: `Order` (cliente, `GET /api/orders/:id`, pública, motivo em linguagem do cliente via `orders/customer-language.ts`) e `StaffOrder` (colaborador, `GET /api/staff/orders/:id`, com o diagnóstico). A API guarda só o `OrderRecord` e projeta as duas em `orders/order-views.ts`. Torre (`GET /api/staff/tower`) e resumo por mercado (`GET /api/orders/summary`) saem de `orders/tower-stats.ts`, calculados uma vez na carga. "Promessa ajustada" da Gold (`workspace.gold.param_cenario_prazo`, `orders/promise-scenario.ts`) vem da mesma fonte dos pedidos em cada modo: `databricks` consulta e guarda no cache, `file` lê `dados/gold_param_cenario_prazo.csv` (do `pnpm export:dados`; sem ele não sobe), `fixtures` lê `orders/fixtures/promise-scenario.json`. Busca do colaborador: `GET /api/staff/orders` (`orders/order-search.ts`).
- Login (`api/src/auth/`): cookie `translog_session` `HttpOnly` assinado com HMAC (`node:crypto`), senha em scrypt, 5 erros/min por IP → `429`. Todo `/api/staff/*` passa pelo hook único de `staff/routes.ts`. A tela nunca lê o cookie: pergunta `GET /api/auth/session`.
- Tela: roteador próprio com History API (`web/src/lib/router.ts`, lógica pura testada; `use-location.tsx`). Rotas `/`, `/rastreio?pedido=N` (e o antigo `/?pedido=N`), `/colaborador/entrar`, `/colaborador`, `/colaborador/pedidos/:id`. Conversa do LogBot fica no `App` (`use-chat-conversation.ts`), a mesma no Início e no Rastreamento; painel lateral em `features/chat/logbot-dock.tsx` (estado em `logbot-panel.ts`, `localStorage`). Sem chat na Área do colaborador.
- A API devolve o view model `Order` pronto. A conversão das tabelas `consumo_*` → `Order` fica só em `orders/consumo-mapper.ts`; o `SELECT` (colunas explícitas) só em `orders/consumo-sql.ts`; a regra da central (`escalateToSupport`) só em `orders/escalation.ts`.
- Chat sem histórico no servidor. A regra do assistente simulado fica só em `api/src/chat/mock-agent.ts` (nunca no frontend), com tom amigável e gentil. O nome do assistente (LogBot, confirmado em 17/11) fica só em `ASSISTANT_NAME` (`contracts/src/chat.ts`). O formato do pedido de contexto enviado ao agente fica só em `withOrderContext` (`chat/adk-agent.ts`). Nenhum reenvio automático, exceto após `404` "Session not found" (uma vez).
- Datas são texto de calendário (`AAAA-MM-DD`): nunca `new Date(string)` (os timestamps vêm em UTC e mudariam de dia em Brasília). No SQL do export, timestamps em ISO com fuso (`date_format(col, "yyyy-MM-dd'T'HH:mm:ss.SSSXXX")`, que o agente exige); o portal usa só os 10 primeiros caracteres.

## Convenções

- Código, identificadores, arquivos e rotas em **inglês**. Mensagens da API, docs e commits em **pt-BR**.
- Valores de dados como vêm da base, sem traduzir (`Em trânsito`, `Standard Class`, `LATAM`). Na tela, a causa é sempre "Motivo provável".
- Commits: `tipo(portal): descrição` (ex.: `feat(portal): ...`, `test(portal): ...`).
- TypeScript `strict`, sem `any` (use `unknown` e valide). Versões exatas de dependências; compartilhadas no `catalog` do `pnpm-workspace.yaml`.
- Configuração só por variáveis de ambiente, documentadas em `.env.example`. Nenhum segredo no repositório.
- Testes ao lado do arquivo (`*.test.ts`); rotas testadas com `app.inject`.
