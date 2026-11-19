# syntax=docker/dockerfile:1

# Portal completo numa imagem só: a API e a tela (React), servida pela própria API na mesma porta.
# Contexto de build: pasta portal/.
#   docker build -f api/Dockerfile -t translog-api .
# Etapa `web`: compila a tela (Vite) para web/dist. Etapa `runtime`: só a API e esse dist.
# O Node 24 executa o TypeScript da API direto (remoção de tipos), sem etapa de build.
# O layout do workspace é mantido de propósito: o Node não remove tipos dentro de
# node_modules, e o @translog/contracts é ligado por symlink até contracts/.
# Dados e credenciais nunca entram na imagem: os CSVs chegam por volume (docker-compose.dados.yml)
# e as credenciais do Databricks por variável de ambiente (docker-compose.databricks.yml).

FROM node:24.22.3-alpine3.24 AS base
ENV COREPACK_ENABLE_DOWNLOAD_PROMPT=0
RUN corepack enable
WORKDIR /app

# Dependências de produção da API e do contracts, com cache do store do pnpm.
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
COPY contracts/package.json contracts/
RUN --mount=type=cache,id=translog-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --filter "@translog/api..." --store-dir /pnpm/store

# Compila a tela. Só o resultado (web/dist) segue para a imagem final: as dependências de
# desenvolvimento (Vite, Tailwind…) ficam nesta etapa.
FROM base AS web
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY api/package.json api/
COPY contracts/package.json contracts/
COPY web/package.json web/
RUN --mount=type=cache,id=translog-pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --filter "@translog/web..." --store-dir /pnpm/store
COPY tsconfig.base.json ./
COPY contracts/ contracts/
COPY web/ web/
RUN pnpm --filter @translog/web build

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/api/node_modules ./api/node_modules
COPY --from=deps /app/contracts/node_modules ./contracts/node_modules
COPY api/package.json api/
COPY api/src api/src
COPY contracts/package.json contracts/
COPY contracts/src contracts/src
COPY --from=web /app/web/dist web/dist
# A API serve a tela compilada (caminho relativo a portal/ = /app). Sem isto, só responde /api e /docs.
ENV WEB_DIR=web/dist
USER node
EXPOSE 3333
CMD ["node", "api/src/main.ts"]
