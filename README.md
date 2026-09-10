# Recruitment AI

Recruitment AI is a pnpm monorepo containing the React frontend, Express API,
shared packages, and the separately loaded Chrome extension.

## Running locally with Docker

Docker runs the frontend, API, migrations, and PostgreSQL. Node.js, pnpm, and a
host PostgreSQL installation are not required.

1. Install Docker Desktop.
2. Clone this repository.
3. Copy `.env.example` to `.env`.
4. Set a value for `POSTGRES_PASSWORD` in `.env`.
5. Leave `USE_MOCK_AI=true`, or add `GROQ_API_KEY` and set
   `USE_MOCK_AI=false` to use real AI.
6. Start the application:

   ```sh
   docker compose up --build
   ```

7. Open [http://localhost:5173](http://localhost:5173).
8. Stop the application:

   ```sh
   docker compose down
   ```

PostgreSQL data remains in the named Docker volume when the containers are
stopped or recreated. Use `docker compose down -v` only when you intentionally
want to remove the database data.

The frontend uses nginx to proxy `/api` requests to the API container. The
unpacked Chrome extension continues to call `http://localhost:3000` directly;
set `CHROME_EXTENSION_ORIGIN` to its exact `chrome-extension://...` origin when
using the extension.

## Non-Docker development

Install Node.js 24 and pnpm, run `pnpm install`, then start either application:

```sh
pnpm dev:web
pnpm dev:api
```

Vite proxies frontend `/api` requests to `http://localhost:3000` during local
development.
