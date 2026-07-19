# syntax=docker/dockerfile:1

# --- deps ---
FROM node:22-alpine AS deps
RUN corepack enable

WORKDIR /app

COPY server/package.json server/pnpm-lock.yaml server/pnpm-workspace.yaml ./
COPY server/patches/ ./patches/

RUN pnpm install --frozen-lockfile

# --- build ---
FROM node:22-alpine AS build
RUN corepack enable

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY server/ .

# Build-time placeholders so env validation passes during pre-rendering.
# Real values are provided at runtime.
RUN BASE_URL=http://placeholder \
    CLAIM_SECRET=placeholder \
    pnpm build

# Bundle the migration CLI so the runner needs no TS tooling or extra packages.
RUN pnpm exec esbuild lib/db/migrate.ts --bundle --platform=node --format=esm \
    --outfile=migrate.mjs --external:@libsql/client

# --- runner ---
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
ENV TURSO_URL=file:/app/data/local.db

RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nextjs

COPY --from=build /app/public ./public
COPY --from=build /app/drizzle ./drizzle
COPY --from=build --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=build --chown=nextjs:nodejs /app/.next/static ./.next/static

COPY --from=build /app/migrate.mjs ./migrate.mjs

RUN mkdir -p /app/data /app/public/uploads && \
    chown -R nextjs:nodejs /app/public /app/data && \
    chown nextjs:nodejs /app

USER nextjs

EXPOSE 3000

CMD ["node", "server.js"]
