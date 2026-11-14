# Portal de rastreamento TransLog

## Contexto

Projeto Integrador do IPNET Academy 2026, grupo 3. Banca em 23/11/2026; code freeze em 19/11.

Cliente fictício: **TransLog**, operadora logística internacional. Despacha pedidos de e-commerce a partir dos EUA e de Porto Rico para cinco mercados, em quatro níveis de serviço (Standard Class, Second Class, First Class, Same Day). Dor central: promessa de prazo irreal nas modalidades rápidas.

Esta pasta é o **portal**: o cliente digita o número do pedido, vê situação, prazo e motivo provável de atraso, e conversa com um assistente de IA. Responsável: Matheus (FullStack). O resto do repositório é de outras pessoas do grupo: `agent/` (Marco, agente ADK em Python), `pipeline/` e `bases/` (Mateus, dados), `dashboard/` (Marcelo, BI).

Contexto detalhado, decisões e pendências ficam em `portal/_contexto/` (local, fora do Git): leia `backend-analise.md`, `projeto.md`, `decisoes.md` e `pendencias.md` antes de mudar contrato ou arquitetura.

## Regras

- **Git só pelo humano.** Não rode `git add`, `commit`, `branch`, `push`, `rebase`, `stash` nem similares. Ao fim de cada tarefa: `pnpm lint`, `pnpm typecheck`, `pnpm test`, marque o `tasks.md`, sugira a mensagem de commit e pare.
- **Não altere** `agent/`, `pipeline/`, `bases/`, `dashboard/`, `docs/` da raiz nem `portal/prototipos/`. O `.gitignore` da raiz só muda com autorização.
- `portal/_contexto/` e `portal/dados/` nunca vão para o Git. Confira com `git status` antes de sugerir commit.
- **Privacidade:** nenhuma resposta da API contém id do cliente, segmento, tipo de pagamento, lucro, margem, desconto, latitude/longitude ou `resumo_rastreio_rag`. Essas colunas são descartadas **na leitura** da Silver, não só na saída.
- A Silver (`portal/dados/silver_pedidos_rastreio.csv`) nunca entra no Git nem na imagem Docker. Fixtures de teste em CSV usam valores reais só nas colunas que o portal lê; as demais recebem valores fictícios.
- Nada de abstração especulativa: só o que a fase atual usa. Chat e agente só depois do acordo com o Marco.
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
docker compose up --build        # forma oficial de rodar a API (fixtures)
docker compose -f docker-compose.yml -f docker-compose.silver.yml up --build  # com a Silver
docker compose down
```

Pacotes: `@translog/api` (`api/`), `@translog/contracts` (`contracts/`) e `@translog/web` (`web/`). Tela em `http://localhost:5173`; documentação da API em `http://localhost:3333/docs`.

## Arquitetura

Documentação técnica completa em `docs/backend.md` (mantenha atualizada ao mudar estrutura, contrato, configuração ou Docker). O `README.md` é a visão geral para o time, em linguagem não técnica.

- O Node 24 executa o TypeScript direto (sem build): imports relativos com `.ts`, sem `enum`/`namespace` (`erasableSyntaxOnly`).
- `contracts/` tem os esquemas Zod: validam entrada e saída da API, geram o OpenAPI e os tipos (`z.infer`).
- `api/src/`: `main.ts` (bootstrap), `server.ts` (Fastify, swagger, rotas), `config.ts` (variáveis validadas no boot), `container.ts` (**único** lugar que escolhe adapters), `http/errors.ts` (**único** lugar que transforma erros em HTTP).
- Código agrupado por funcionalidade (`orders/`), com porta e adapters. Funções fábrica (`createX(deps)`), sem classes de serviço.
- A API devolve o view model `Order` pronto. A conversão Silver → `Order` fica só em `orders/silver-mapper.ts`.
- Datas são texto de calendário (`AAAA-MM-DD`): nunca `new Date(string)` (a Silver vem em UTC e mudaria de dia em UTC-3).

## Convenções

- Código, identificadores, arquivos e rotas em **inglês**. Mensagens da API, docs e commits em **pt-BR**.
- Valores de dados como vêm da base, sem traduzir (`Em Trânsito`, `Standard Class`, `LATAM`).
- Commits: `tipo(portal): descrição` (ex.: `feat(portal): ...`, `test(portal): ...`).
- TypeScript `strict`, sem `any` (use `unknown` e valide). Versões exatas de dependências; compartilhadas no `catalog` do `pnpm-workspace.yaml`.
- Configuração só por variáveis de ambiente, documentadas em `.env.example`. Nenhum segredo no repositório.
- Testes ao lado do arquivo (`*.test.ts`); rotas testadas com `app.inject`.
