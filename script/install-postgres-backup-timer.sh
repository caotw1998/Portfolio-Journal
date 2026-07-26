#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"
SYSTEMD_SOURCE_DIR="$SCRIPT_DIR/systemd"
SYSTEMD_TARGET_DIR="$HOME/.config/systemd/user"
CONFIG_TARGET_DIR="$HOME/.config/portfolio-journal"
ENV_TARGET_FILE="$CONFIG_TARGET_DIR/postgres-backup.env"
SERVICE_TARGET_FILE="$SYSTEMD_TARGET_DIR/portfolio-journal-postgres-backup.service"
TIMER_TARGET_FILE="$SYSTEMD_TARGET_DIR/portfolio-journal-postgres-backup.timer"

backup_root_default="$HOME/backups/postgres/portfolio_journal"
database_name_default="portfolio_journal"
retention_days_default="14"

mkdir -p "$SYSTEMD_TARGET_DIR" "$CONFIG_TARGET_DIR"

if [[ ! -f "$ENV_TARGET_FILE" ]]; then
  sed \
    -e "s|__DATABASE_NAME__|$database_name_default|g" \
    -e "s|__BACKUP_ROOT__|$backup_root_default|g" \
    -e "s|__RETENTION_DAYS__|$retention_days_default|g" \
    "$SYSTEMD_SOURCE_DIR/postgres-backup.env.example" > "$ENV_TARGET_FILE"
  printf 'Created env template: %s\n' "$ENV_TARGET_FILE"
else
  printf 'Keeping existing env file: %s\n' "$ENV_TARGET_FILE"
fi

sed \
  -e "s|__WORKDIR__|$REPO_ROOT|g" \
  "$SYSTEMD_SOURCE_DIR/portfolio-journal-postgres-backup.service" > "$SERVICE_TARGET_FILE"
cp "$SYSTEMD_SOURCE_DIR/portfolio-journal-postgres-backup.timer" "$TIMER_TARGET_FILE"

systemctl --user daemon-reload

cat <<EOF
Installed systemd user unit files:
  $SERVICE_TARGET_FILE
  $TIMER_TARGET_FILE

Next steps:
1. Edit $ENV_TARGET_FILE and fill in DATABASE_URL.
2. Enable the timer:
   systemctl --user enable --now portfolio-journal-postgres-backup.timer
3. Check status:
   systemctl --user status portfolio-journal-postgres-backup.timer
   journalctl --user -u portfolio-journal-postgres-backup.service -n 50 --no-pager
EOF
