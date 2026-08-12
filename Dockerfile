FROM node:22-alpine AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json ./
RUN npm ci

FROM deps AS build
COPY . .
# SvelteKit's post-build analyse step imports server modules (including db/index.ts),
# which throws if DATABASE_URL is missing. Provide a placeholder so the build passes;
# the real value is injected at runtime via compose.yaml.
RUN DATABASE_URL=postgres://build:build@localhost:5432/build npm run build

# Kept as one image (not pruned to production-only deps) on purpose:
# migrations/seeding run via drizzle-kit and plain `node --experimental-
# strip-types` on the TypeScript seed scripts at container start, both
# of which need devDependencies (drizzle-kit, typescript) present. This
# is a small internal LAN tool -- correctness and a simple, easy-to-
# reason-about image mattered more here than shaving image size.
FROM base AS runtime
ENV NODE_ENV=production
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/drizzle ./drizzle
COPY --from=build /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/src ./src
COPY --from=build /app/package.json ./package.json
COPY docker-entrypoint.sh ./docker-entrypoint.sh
RUN chmod +x docker-entrypoint.sh

EXPOSE 3000
ENTRYPOINT ["./docker-entrypoint.sh"]
