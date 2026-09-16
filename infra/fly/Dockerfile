# Build context is the repository root:
#   docker build -f infra/fly/Dockerfile .
# Stages: deps (install, also used by compose for the Vite dev server) -> build -> runtime (distroless).

FROM node:22-bookworm-slim AS deps
RUN npm install -g pnpm@12.4.2
WORKDIR /app
COPY . .
RUN pnpm install --frozen-lockfile

FROM deps AS build
ARG GIT_SHA=unknown
RUN pnpm --filter @desk/web build && pnpm --filter @desk/api build

FROM gcr.io/distroless/nodejs22-debian12 AS runtime
WORKDIR /app
ARG GIT_SHA=unknown
ENV NODE_ENV=production PORT=3000 GIT_SHA=$GIT_SHA
COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/packages/db/migrations ./migrations
COPY --from=build /app/apps/web/dist ./public
EXPOSE 3000
CMD ["dist/node.js"]
