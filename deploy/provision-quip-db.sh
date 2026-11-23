#!/usr/bin/env bash
# Run on quip. Keep the shared server's administrator credentials in its pod.
set -euo pipefail

k() { sudo -n k3s kubectl "$@"; }
postgres_exec() { k -n trainer-archive exec -i trainer-archive-postgres-0 -- "$@"; }
admin_sql() {
  postgres_exec sh -ec 'exec psql -XAt -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres'
}

if [[ -z $(k get namespace companykeeping --ignore-not-found -o name) ]]; then
  k create namespace companykeeping
fi
if [[ -z $(k -n companykeeping get secret companykeeping-db --ignore-not-found -o name) ]]; then
  existing=$(admin_sql <<'SQL'
SELECT EXISTS (SELECT FROM pg_roles WHERE rolname = 'companykeeping')
    OR EXISTS (SELECT FROM pg_database WHERE datname = 'companykeeping');
SQL
)
  if [[ $existing != f ]]; then
    echo 'Restore the existing companykeeping-db Secret before reprovisioning.' >&2
    exit 1
  fi
  openssl rand -hex 32 | tr -d '\n' | k -n companykeeping create secret generic companykeeping-db \
    --from-file=COMPANYKEEPING_DB_PASSWORD=/dev/stdin
fi

password_line() {
  k -n companykeeping get secret companykeeping-db -o jsonpath='{.data.COMPANYKEEPING_DB_PASSWORD}' | base64 -d
  printf '\n'
}

{
  password_line
  cat <<'SQL'
SELECT pg_advisory_lock(hashtextextended('provision/companykeeping', 0));
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_roles WHERE rolname = 'companykeeping' AND
        (rolsuper OR rolcreaterole OR rolcreatedb OR rolreplication OR rolbypassrls OR NOT rolcanlogin))
     OR EXISTS (SELECT FROM pg_auth_members WHERE member = to_regrole('companykeeping'))
     OR EXISTS (SELECT FROM pg_database WHERE datname = 'companykeeping'
        AND pg_get_userbyid(datdba) <> 'companykeeping') THEN
    RAISE EXCEPTION 'Existing Companykeeping database or role has unexpected privileges or ownership';
  END IF;
END $$;
SELECT NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'companykeeping') AS create_role \gset
\if :create_role
  \getenv app_password COMPANYKEEPING_DB_PASSWORD
  CREATE ROLE companykeeping LOGIN PASSWORD :'app_password' NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
\endif
SELECT 'CREATE DATABASE companykeeping OWNER companykeeping'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'companykeeping') \gexec
REVOKE ALL ON DATABASE companykeeping FROM PUBLIC;
SQL
} | postgres_exec sh -ec '
  IFS= read -r COMPANYKEEPING_DB_PASSWORD && test -n "$COMPANYKEEPING_DB_PASSWORD" || exit 1
  export COMPANYKEEPING_DB_PASSWORD
  exec psql -X -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres'

password_line | postgres_exec sh -ec '
  IFS= read -r PGPASSWORD && test -n "$PGPASSWORD" || exit 1
  export PGPASSWORD
  exec psql -XAt -v ON_ERROR_STOP=1 -h 127.0.0.1 -U companykeeping -d companykeeping -c "SELECT current_user, current_database()"'
