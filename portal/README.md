# Portal de rastreamento TransLog

Portal em que o cliente da TransLog digita o número do pedido e vê a situação, o prazo, a rota e os itens, com um assistente de IA para tirar dúvidas (o chat chega numa próxima fase).

Esta pasta é um workspace pnpm com dois pacotes:

| Pacote | Pasta | Conteúdo |
|---|---|---|
| `@translog/api` | `api/` | API em Fastify + Zod, documentação OpenAPI em `/docs` |
| `@translog/contracts` | `contracts/` | Esquemas Zod compartilhados (contrato da API) |

## Pré-requisitos

- Node 24 (`nvm use` lê o `.nvmrc`)
- pnpm via corepack: `corepack enable`

## Rodar em desenvolvimento

```bash
cd portal
pnpm install
pnpm dev
```

A API sobe em `http://localhost:3333` e recarrega ao salvar. Sem `.env`, usa os pedidos de exemplo que vêm no código.

- Saúde: `curl http://localhost:3333/api/health`
- Documentação: `http://localhost:3333/docs`

Para mudar a configuração: `cp .env.example .env` e ajuste. As variáveis estão explicadas no próprio `.env.example`.

## Comandos

```bash
pnpm test        # testes (Vitest)
pnpm lint        # Biome: lint e formatação (só verifica)
pnpm format      # Biome corrigindo o que for possível
pnpm typecheck   # tsc em todos os pacotes
```
