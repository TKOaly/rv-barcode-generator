#!/bin/sh
set -eu
node --import tsx server/migrate.ts
exec "$@"
