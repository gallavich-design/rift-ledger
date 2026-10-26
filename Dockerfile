# Rift Ledger — one container: Next.js server + SQLite on a mounted volume (/data).
# Build: docker build -t rift-ledger .
# Run:   docker run -p 3000:3000 -v rift-data:/data -e APP_PASSWORD=… -e AUTH_SECRET=… -e CRON_SECRET=… rift-ledger

FROM node:22-bookworm-slim AS build
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci
COPY . .
RUN npm run build

FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
ENV NODE_ENV=production \
    PORT=3000 \
    DATABASE_URL=file:/data/rift-ledger.db \
    NEXT_TELEMETRY_DISABLED=1
COPY --from=build /app ./
RUN mkdir -p /data
VOLUME /data
EXPOSE 3000
CMD ["sh", "scripts/start-server.sh"]
