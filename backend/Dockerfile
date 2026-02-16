# ── Stage 1: Install dependencies ─────────────────────────────────────
FROM node:22-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Build TypeScript ─────────────────────────────────────────
FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY src/ ./src/

RUN pnpm tsc

# ── Stage 3: Production image ────────────────────────────────────────
FROM node:22-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy compiled output + production deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json pnpm-lock.yaml ./

# Copy migration SQL files (needed at runtime for tenant provisioning)
COPY src/database/migrations ./src/database/migrations
COPY src/database/migrations-public ./src/database/migrations-public
COPY scripts/ ./scripts/

# Remove dev dependencies
RUN pnpm prune --prod

ENV NODE_ENV=production
ENV PORT=3000

USER appuser

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
    CMD wget -qO- http://localhost:3000/health || exit 1

CMD ["node", "--enable-source-maps", "dist/server.js"]
