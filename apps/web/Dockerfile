FROM node:24-alpine AS build

RUN npm install --global pnpm@11.21.0

WORKDIR /app

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY apps/web/package.json ./apps/web/package.json

RUN pnpm install --filter web --frozen-lockfile

COPY apps/web/index.html apps/web/vite.config.js ./apps/web/
COPY apps/web/public ./apps/web/public
COPY apps/web/src ./apps/web/src

RUN pnpm --filter web build

FROM nginx:1.27-alpine

COPY apps/web/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html

EXPOSE 80
