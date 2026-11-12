# syntax=docker/dockerfile:1
#
# Self-hosted dropzone image (DEPLOY_TARGET=bun): SvelteKit (adapter-node output) on the Bun runtime,
# bun:sqlite database + uploads on the /data volume. Migrations run automatically on startup.
# Docs: docs/SELF_HOSTING.md. Published multi-arch (linux/amd64, linux/arm64) by
# .github/workflows/docker.yml as ghcr.io/<owner>/log-book.
#
#   docker build -t log-book .                                    # local, current platform
#   docker buildx build --platform linux/amd64,linux/arm64 .      # what CI does
#
# Multi-arch without slow emulation: the build and deps stages run on the BUILD machine's platform
# ($BUILDPLATFORM). Their output is plain JavaScript (no native addons; the deps stage fails if one
# appears), so it is copied as-is into the target-platform runtime image. Only the final stage uses
# the target platform's oven/bun image (oven-sh publishes amd64 + arm64).

ARG BUN_VERSION=1.4

# ---- build: full install + vite build ----------------------------------------------------------
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION} AS build
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
# Shown by /api/health (the build context has no .git). CI passes the commit SHA;
# locally: docker compose build --build-arg GIT_SHA=$(git rev-parse --short HEAD)
ARG GIT_SHA=""
ENV DEPLOY_TARGET=bun GIT_SHA=${GIT_SHA}
# Source maps aren't served and only bloat the image.
RUN bun run build:bun \
 && find build -name '*.map' -delete \
 && mkdir -p /out/data/uploads

# ---- deps: production dependencies only (adapter-node keeps package.json deps external) --------
FROM --platform=$BUILDPLATFORM oven/bun:${BUN_VERSION} AS deps
WORKDIR /app
COPY package.json bun.lock ./
# Fails on native addons; then drops type-only packages (optional peers of drizzle-orm) and
# declaration/source-map files: ~40 MB that is never loaded.
RUN bun install --frozen-lockfile --production --ignore-scripts \
 && if [ -n "$(find node_modules -name '*.node' -print -quit)" ]; then \
      echo 'Native addon in production deps: it would break the cross-built amd64/arm64 image.' >&2; \
      find node_modules -name '*.node' >&2; exit 1; \
    fi \
 && rm -rf node_modules/@types node_modules/bun-types node_modules/undici-types node_modules/@cloudflare \
 && find node_modules -type f \( -name '*.map' -o -name '*.d.ts' -o -name '*.d.mts' -o -name '*.d.cts' \) -delete

# ---- runtime -----------------------------------------------------------------------------------
FROM oven/bun:${BUN_VERSION}-slim AS runtime
LABEL org.opencontainers.image.title="Log-Book" \
      org.opencontainers.image.description="Log-Book: dropzone management + jumper logbook, self-hosted (Bun + SQLite)" \
      org.opencontainers.image.licenses="AGPL-3.0-or-later"
WORKDIR /app
ENV NODE_ENV=production \
    HOST=0.0.0.0 \
    PORT=3000 \
    INSTANCE_MODE=dropzone \
    DATABASE_PATH=/data/app.db \
    MIGRATIONS_DIR=/app/drizzle \
    UPLOADS_DIR=/data/uploads \
    STORAGE_DRIVER=disk \
    BODY_SIZE_LIMIT=12M
# App files stay root-owned (read-only for the app user); only /data is writable.
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY drizzle ./drizzle
COPY scripts/backup.ts ./scripts/backup.ts
COPY package.json LICENSE ./
# A fresh named volume mounted at /data takes this ownership (uid/gid 1000 = "bun" in oven/bun).
COPY --from=build --chown=1000:1000 /out/data /data
USER bun
VOLUME ["/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["bun", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then(r => process.exit(r.ok ? 0 : 1)).catch(() => process.exit(1))"]
CMD ["bun", "build/server.js"]
