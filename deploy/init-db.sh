#!/usr/bin/env bash
set -euo pipefail
# The postgres container runs this only when initializing a new data directory.
psql --set=ON_ERROR_STOP=1 --username "${POSTGRES_USER}" --dbname postgres \
  --set="app_password=${COMPANYKEEPING_DB_PASSWORD}" <<'SQL'
CREATE ROLE companykeeping LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOBYPASSRLS;
CREATE DATABASE companykeeping OWNER companykeeping;
SQL
