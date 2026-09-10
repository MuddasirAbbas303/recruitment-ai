FROM node:24-bookworm-slim

ENV NODE_ENV=production

RUN npm install --global pnpm@11.21.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/api/package.json ./apps/api/package.json

RUN pnpm install --filter api --frozen-lockfile

COPY apps/api/config ./apps/api/config
COPY apps/api/migrations ./apps/api/migrations
COPY apps/api/src ./apps/api/src
COPY apps/api/docker-entrypoint.sh ./apps/api/docker-entrypoint.sh

RUN mkdir -p ./apps/api/uploads/resumes \
  && chmod +x ./apps/api/docker-entrypoint.sh \
  && chown -R node:node /app

USER node
WORKDIR /app/apps/api

EXPOSE 3000

CMD ["./docker-entrypoint.sh"]
