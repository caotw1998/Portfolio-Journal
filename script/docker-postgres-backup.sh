#!/usr/bin/env bash

set -euo pipefail
umask 077

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
BACKUP_ROOT="${BACKUP_ROOT:-${1:-}}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if ! command -v docker >/dev/null 2>&1; then
  printf 'Docker is required.\n' >&2
  exit 1
fi
if [[ -z "$BACKUP_ROOT" || "$BACKUP_ROOT" != /* ]]; then
  printf 'BACKUP_ROOT must be an absolute path outside the repository.\n' >&2
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
if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$RETENTION_DAYS" -lt 1 ]]; then
  printf 'RETENTION_DAYS must be a positive integer.\n' >&2
  exit 1
fi

chmod 700 "$BACKUP_ROOT"
cd "$REPO_ROOT"
database_name="$(docker compose exec -T db sh -c 'printf %s "$POSTGRES_DB"')"
if [[ -z "$database_name" || ! "$database_name" =~ ^[A-Za-z0-9_-]+$ ]]; then
  printf 'Could not resolve a safe database name from the db service.\n' >&2
  exit 1
fi

timestamp="$(date -u +%Y-%m-%dT%H%M%SZ)"
final_dump="$BACKUP_ROOT/${database_name}-${timestamp}.dump"
temporary_dump="$(mktemp "$BACKUP_ROOT/.${database_name}-${timestamp}.XXXXXX.dump")"

cleanup() {
  if [[ -f "$temporary_dump" ]]; then rm -f -- "$temporary_dump"; fi
}
trap cleanup EXIT

printf 'Creating PostgreSQL backup: %s\n' "$final_dump"
docker compose exec -T db sh -c 'PGPASSWORD="$POSTGRES_PASSWORD" exec pg_dump --host=127.0.0.1 --username="$POSTGRES_USER" --dbname="$POSTGRES_DB" --format=custom --compress=9 --no-owner --no-privileges' > "$temporary_dump"
if [[ ! -s "$temporary_dump" ]]; then
  printf 'Backup is empty; refusing to publish it.\n' >&2
  exit 1
fi

mv -- "$temporary_dump" "$final_dump"
(cd "$BACKUP_ROOT" && sha256sum "$(basename "$final_dump")" > "$(basename "$final_dump").sha256")
chmod 600 "$final_dump" "$final_dump.sha256"
ln -sfn "$(basename "$final_dump")" "$BACKUP_ROOT/latest.dump"

find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${database_name}-*.dump" -mtime "+$RETENTION_DAYS" -delete
find "$BACKUP_ROOT" -maxdepth 1 -type f -name "${database_name}-*.dump.sha256" -mtime "+$RETENTION_DAYS" -delete

printf 'POSTGRES_BACKUP_OK %s\n' "$final_dump"
