#!/bin/sh
set -eu

pnpm db:migrate
exec node src/server.js
