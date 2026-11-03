# syntax=docker/dockerfile:1
FROM node:24-bookworm-slim AS builder
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
RUN npm install --global pnpm@10.28.2
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
RUN pnpm build && pnpm prune --prod

FROM node:24-bookworm-slim AS runtime
ENV NODE_ENV=production \
    API_HOST=0.0.0.0 \
    API_PORT=3001 \
    DATABASE_PATH=/app/data/catalog.sqlite
WORKDIR /app
COPY --from=builder /app/package.json /app/LICENSE ./
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server ./server
COPY --from=builder /app/src/catalog.ts ./src/catalog.ts
COPY --from=builder /app/drizzle ./drizzle
COPY --from=builder /app/seed/CATALOG.zip ./seed/CATALOG.zip
COPY --chmod=755 docker/entrypoint.sh /usr/local/bin/catalog-entrypoint
RUN mkdir /app/data && chown node:node /app/data
USER node
EXPOSE 3001
VOLUME ["/app/data"]
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
    CMD ["node", "-e", "fetch('http://127.0.0.1:'+process.env.API_PORT+'/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]
ENTRYPOINT ["catalog-entrypoint"]
CMD ["node", "--import", "tsx", "server/index.ts"]
