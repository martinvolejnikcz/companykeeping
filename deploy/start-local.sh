#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
if [ ! -e .env ]; then
  (
    set -C
    umask 077
    admin_password=$(openssl rand -hex 24)
    app_password=$(openssl rand -hex 24)
    printf 'POSTGRES_PASSWORD=%s\nCOMPANYKEEPING_DB_PASSWORD=%s\n' "$admin_password" "$app_password" > .env
  )
fi
docker compose up -d --build --wait
printf 'Companykeeping is available at http://127.0.0.1:%s\n' "$(docker compose port app 4317 | awk -F: '{print $NF}')"
