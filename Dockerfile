# syntax=docker/dockerfile:1.7

FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
WORKDIR /app
RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.32.1 --activate

FROM base AS dependencies
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile

FROM dependencies AS builder
COPY . .
RUN pnpm exec prisma generate
RUN pnpm build

FROM dependencies AS migrator
ENV NODE_ENV=production
COPY prisma ./prisma
COPY script/bootstrap-workspace.js ./script/bootstrap-workspace.js
COPY script/deploy-check.js ./script/deploy-check.js
RUN pnpm exec prisma generate
CMD ["sh", "-c", "node script/deploy-check.js && pnpm exec prisma migrate deploy && node script/bootstrap-workspace.js"]

FROM node:24-bookworm-slim@sha256:6f7b03f7c2c8e2e784dcf9295400527b9b1270fd37b7e9a7285cf83b6951452d AS runner
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000
WORKDIR /app

RUN apt-get update \
  && apt-get install --yes --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/* \
  && groupadd --system --gid 10001 nextjs \
  && useradd --system --uid 10001 --gid nextjs --home-dir /app nextjs

COPY --from=builder --chown=nextjs:nextjs /app/public ./public
COPY --from=builder --chown=nextjs:nextjs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nextjs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
CMD ["node", "server.js"]

FROM runner AS worker
COPY --from=builder --chown=nextjs:nextjs /app/script/sync-worker.mjs ./script/sync-worker.mjs
CMD ["node", "script/sync-worker.mjs"]
