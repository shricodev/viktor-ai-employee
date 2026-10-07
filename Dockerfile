FROM node:22-bookworm-slim AS base
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH NODE_ENV=production
RUN corepack enable
WORKDIR /app

FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/gateway/package.json apps/gateway/
COPY apps/worker/package.json apps/worker/
COPY packages/agent/package.json packages/agent/
COPY packages/composio/package.json packages/composio/
COPY packages/config/package.json packages/config/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/sandbox/package.json packages/sandbox/
COPY packages/slack/package.json packages/slack/
COPY packages/tools/package.json packages/tools/
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile --prod

FROM base AS runtime
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates tini \
 && rm -rf /var/lib/apt/lists/*
COPY --from=deps /app /app
COPY . .
USER node
ENTRYPOINT ["/usr/bin/tini", "--"]

FROM runtime AS gateway
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s CMD node -e "fetch('http://localhost:3000/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/gateway/src/main.ts"]

FROM runtime AS worker
# The worker manages sandbox containers through the host Docker socket.
USER root
CMD ["node", "apps/worker/src/main.ts"]
