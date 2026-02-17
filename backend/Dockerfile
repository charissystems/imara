# ── Stage 1: Install dependencies ─────────────────────────────────────
FROM node:25-alpine AS deps

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod=false

# ── Stage 2: Typecheck + Bundle ───────────────────────────────────────
#
# Why esbuild instead of bare `pnpm tsc`:
#   tsconfig uses moduleResolution:"bundler" which emits imports without
#   .js extensions — valid for bundlers, broken for Node.js native ESM.
#   esbuild resolves all relative imports at bundle time so no extensions
#   are needed at runtime, while --packages=external keeps node_modules
#   out of the bundle (loaded from disk as usual).
FROM node:25-alpine AS build

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

# Install esbuild in this stage only (not part of lockfile, build-only tool)
RUN npm install -g esbuild

WORKDIR /app

COPY --from=deps /app/node_modules ./node_modules
COPY package.json pnpm-lock.yaml tsconfig.json ./
COPY src/ ./src/

# Type-check (no emit) — catches all type errors before bundling
RUN pnpm tsc --noEmit

# Bundle: resolves all relative imports, marks node_modules as external.
# --format=esm is required because package.json has "type":"module" so Node
# treats .js files as ESM; esbuild's default CJS output would fail with
# "require is not defined in ES module scope".
RUN esbuild src/server.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --packages=external \
    --format=esm \
    --sourcemap \
    --outfile=dist/server.js

# ── Stage 3: Production image ────────────────────────────────────────
FROM node:25-alpine AS production

RUN corepack enable && corepack prepare pnpm@10.26.2 --activate

# Security: run as non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Copy bundle + production deps
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json pnpm-lock.yaml ./

# Migration SQL files — path must match what MigrationRunner resolves at runtime.
# MigrationRunner derives __dirname from import.meta.url of the bundle, which
# resolves to /app/dist (the bundle location), so '../database/migrations*'
# points to /app/database/migrations*.
COPY src/database/migrations ./database/migrations
COPY src/database/migrations-public ./database/migrations-public
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
