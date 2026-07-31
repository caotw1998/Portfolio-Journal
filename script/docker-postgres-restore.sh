#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
dump_file="${1:-}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required.\n' >&2
  exit 1
fi
if [[ -z "$dump_file" || ! -f "$dump_file" || ! -r "$dump_file" ]]; then
  printf 'Usage: BACKUP_ROOT=/absolute/path RESTORE_CONFIRM=<database> %s /absolute/path/database.dump\n' "$0" >&2
  exit 1
fi
dump_file="$(realpath "$dump_file")"
if [[ -z "${BACKUP_ROOT:-}" || "$BACKUP_ROOT" != /* ]]; then
  printf 'BACKUP_ROOT must be an absolute path outside the repository so a safety backup can be created.\n' >&2
  exit 1
fi
mkdir -p "$BACKUP_ROOT"
BACKUP_ROOT="$(cd "$BACKUP_ROOT" && pwd -P)"
case "$BACKUP_ROOT/" in
  "$REPO_ROOT"/*)
    printf 'BACKUP_ROOT must be outside the repository.\n' >&2
    exit 1
    ;;
esac

checksum_file="$dump_file.sha256"
if [[ -f "$checksum_file" ]]; then
  (cd "$(dirname "$dump_file")" && sha256sum --check "$(basename "$checksum_file")")
fi

cd "$REPO_ROOT"
if docker compose ps --status running --services | grep -qx app; then
  printf 'The app service is running. Stop it with "docker compose stop app" before restoring.\n' >&2
  exit 1
fi
database_name="$(docker compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')"
if [[ -z "$database_name" || "${RESTORE_CONFIRM:-}" != "$database_name" ]]; then
  printf 'Restore target is "%s". Re-run with RESTORE_CONFIRM=%s to confirm replacement.\n' "$database_name" "$database_name" >&2
  exit 1
fi

printf 'Creating mandatory pre-restore backup of database: %s\n' "$database_name"
BACKUP_ROOT="$BACKUP_ROOT" "$SCRIPT_DIR/docker-postgres-backup.sh"

printf 'Restoring %s into database %s\n' "$dump_file" "$database_name"
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_restore --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --clean --if-exists --no-owner --no-privileges --exit-on-error --single-transaction' < "$dump_file"
docker compose run --rm migrate
printf 'POSTGRES_RESTORE_OK %s\n' "$database_name"
