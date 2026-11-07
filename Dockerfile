# Multi-stage Dockerfile for Node.js 22 runtime portability (ADR-0001 / T-111)
FROM node:22-alpine AS base
RUN corepack enable && corepack prepare pnpm@10.6.2 --activate
WORKDIR /app

FROM base AS build
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.json biome.json ./
COPY packages/config/package.json ./packages/config/
COPY packages/shared/package.json ./packages/shared/
COPY packages/db/package.json ./packages/db/
COPY apps/api/package.json ./apps/api/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

COPY . .
RUN pnpm --filter @freetier-loop/web build

EXPOSE 8787
ENV NODE_ENV=production
ENV PORT=8787
ENV SQLITE_PATH=/data/freetier-loop.sqlite

CMD ["node", "--import", "tsx", "apps/api/src/entries/node.ts"]

