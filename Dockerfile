# If `docker build` times out pulling from Docker Hub, fix network/VPN or pre-pull:
#   docker pull oven/bun:1.3.4
# Optional: use a registry mirror and override at build time, e.g.:
#   docker build --build-arg BUN_IMAGE=your.mirror/oven/bun .
ARG BUN_IMAGE=oven/bun
ARG BUN_VERSION=1.3.4

FROM ${BUN_IMAGE}:${BUN_VERSION} AS deps

WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

FROM ${BUN_IMAGE}:${BUN_VERSION} AS build

WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN bun run build

FROM ${BUN_IMAGE}:${BUN_VERSION}

WORKDIR /app
ENV NODE_ENV=production
ENV API_PORT=3210
ENV HOST=0.0.0.0
ENV DATA_DIR=/data
ENV SQLITE_PATH=/data/boomboom.sqlite

COPY package.json bun.lock ./
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY server ./server
COPY shared ./shared

RUN mkdir -p /data

EXPOSE 3210

CMD ["bun", "run", "start"]
