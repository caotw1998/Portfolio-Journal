#!/usr/bin/env bash

set -euo pipefail

timestamp() {
  date +"%Y-%m-%d %H:%M:%S"
}

log() {
  printf '[%s] %s\n' "$(timestamp)" "$*"
}

require_command() {
  local command_name="$1"
  if ! command -v "$command_name" >/dev/null 2>&1; then
    printf 'Missing required command: %s\n' "$command_name" >&2
    exit 1
  fi
}

require_env() {
  local variable_name="$1"
  if [[ -z "${!variable_name:-}" ]]; then
    printf 'Missing required environment variable: %s\n' "$variable_name" >&2
    exit 1
  fi
}

require_command pg_dump
require_command find
require_command mkdir
require_command rm

require_env DATABASE_URL
require_env DATABASE_NAME

BACKUP_ROOT="${BACKUP_ROOT:-$HOME/backups/postgres/$DATABASE_NAME}"
RETENTION_DAYS="${RETENTION_DAYS:-14}"

if ! [[ "$RETENTION_DAYS" =~ ^[0-9]+$ ]] || [[ "$RETENTION_DAYS" -lt 1 ]]; then
  printf 'RETENTION_DAYS must be a positive integer.\n' >&2
  exit 1
fi

snapshot_name="${DATABASE_NAME}-$(date +%F_%H%M%S)"
snapshot_dir="$BACKUP_ROOT/$snapshot_name"
tmp_dir="$BACKUP_ROOT/.tmp-$snapshot_name"
dump_file="$snapshot_dir/${DATABASE_NAME}.dump"
schema_file="$snapshot_dir/${DATABASE_NAME}-schema.sql"
metadata_file="$snapshot_dir/metadata.txt"
latest_link="$BACKUP_ROOT/latest"

cleanup_tmp() {
  rm -rf "$tmp_dir"
}

trap cleanup_tmp EXIT

mkdir -p "$BACKUP_ROOT"
rm -rf "$tmp_dir"
mkdir -p "$tmp_dir"

log "Starting backup for database label: $DATABASE_NAME"
log "Writing snapshot to: $snapshot_dir"

pg_dump \
  --dbname="$DATABASE_URL" \
  --format=custom \
  --compress=9 \
  --no-owner \
  --no-privileges \
  --file="$tmp_dir/${DATABASE_NAME}.dump"

pg_dump \
  --dbname="$DATABASE_URL" \
  --schema-only \
  --no-owner \
  --no-privileges \
  --file="$tmp_dir/${DATABASE_NAME}-schema.sql"

cat > "$tmp_dir/metadata.txt" <<EOF
database_name=$DATABASE_NAME
created_at=$(date --iso-8601=seconds)
host=$(hostname)
retention_days=$RETENTION_DAYS
dump_file=$(basename "$dump_file")
schema_file=$(basename "$schema_file")
EOF

mv "$tmp_dir" "$snapshot_dir"
ln -sfn "$snapshot_dir" "$latest_link"

find "$BACKUP_ROOT" \
  -mindepth 1 \
  -maxdepth 1 \
  -type d \
  -name "${DATABASE_NAME}-*" \
  -mtime +"$RETENTION_DAYS" \
  -exec rm -rf {} +

dump_size="$(du -sh "$dump_file" | awk '{print $1}')"
schema_size="$(du -sh "$schema_file" | awk '{print $1}')"

log "Backup finished successfully."
log "Dump size: $dump_size"
log "Schema size: $schema_size"
log "Latest snapshot link: $latest_link"
