# API Nest OnMangeOu — build et exécution entièrement dans le conteneur.
FROM node:24-bookworm-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN apt-get update -y \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable \
  && corepack prepare pnpm@10.20.0 --activate
WORKDIR /app

FROM base AS deps
COPY package.json pnpm-lock.yaml .npmrc prisma.config.ts ./
COPY prisma ./prisma
RUN pnpm install --frozen-lockfile

FROM deps AS build
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public
COPY . .
RUN pnpm exec prisma generate
RUN node --no-experimental-require-module scripts/bundle-api.cjs

FROM base AS runner
ENV NODE_ENV=production
ENV APP_ENV=local
ENV PORT=3000
WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/prisma.config.ts ./prisma.config.ts
COPY --from=build /app/src/infrastructure/prisma/generated ./src/infrastructure/prisma/generated
COPY --from=build /app/src/common/auth/permissions.ts ./src/common/auth/permissions.ts
COPY --from=build /app/src/domains/entitlements/module-codes.ts ./src/domains/entitlements/module-codes.ts
COPY --from=build /app/package.json ./package.json
COPY docker/entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
EXPOSE 3000
ENTRYPOINT ["/entrypoint.sh"]
