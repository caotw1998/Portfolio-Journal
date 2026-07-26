#!/usr/bin/env bash

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd "$SCRIPT_DIR/.." && pwd -P)"
CHECK_HISTORY=0
REQUIRE_FRESH_ROOT=0

for argument in "$@"; do
  case "$argument" in
    --) ;;
    --history) CHECK_HISTORY=1 ;;
    --fresh-root) REQUIRE_FRESH_ROOT=1 ;;
    *) printf 'Unknown option: %s\n' "$argument" >&2; exit 2 ;;
  esac
done

cd "$REPO_ROOT"
if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  printf 'Public release check must run inside a Git worktree.\n' >&2
  exit 1
fi

is_private_artifact() {
  local path="$1"
  local basename="${path##*/}"
  case "$path" in
    prisma/migrations/*/migration.sql) return 1 ;;
  esac
  case "$path" in
    data/*.snapshot.json|backups/*) return 0 ;;
  esac
  case "$basename" in
    .env|.env.*|*.dump|*.sql|*.sql.gz|*.sqlite|*.sqlite3|*.db|*.pem|id_rsa|id_ed25519) return 0 ;;
  esac
  return 1
}

failed=0
while IFS= read -r -d '' tracked_path; do
  if is_private_artifact "$tracked_path"; then
    printf 'Tracked private artifact: %s\n' "$tracked_path" >&2
    failed=1
  fi
done < <(git ls-files -z)

secret_pattern='-----BEGIN [A-Z0-9 ]*PRIVATE KEY-----|gh[pousr]_[A-Za-z0-9_]{30,}|github_pat_[A-Za-z0-9_]{30,}|AKIA[0-9A-Z]{16}|tskey-[A-Za-z0-9_-]{20,}'
if git grep -I -l -E -e "$secret_pattern" -- . >/tmp/portfolio-public-release-matches.$$ 2>/dev/null; then
  while IFS= read -r matched_path; do printf 'Tracked token-like secret: %s\n' "$matched_path" >&2; done < /tmp/portfolio-public-release-matches.$$
  failed=1
fi
rm -f -- /tmp/portfolio-public-release-matches.$$

if [[ "$CHECK_HISTORY" == "1" ]]; then
  while IFS= read -r historical_path; do
    [[ -z "$historical_path" ]] && continue
    if is_private_artifact "$historical_path"; then
      printf 'Git history contains a private artifact path: %s\n' "$historical_path" >&2
      failed=1
    fi
  done < <(git log --all --name-only --format= | sort -u)

  while IFS= read -r commit; do
    if git grep -I -q -E -e "$secret_pattern" "$commit" -- . 2>/dev/null; then
      printf 'Git history contains a token-like secret in commit %s.\n' "$commit" >&2
      failed=1
    fi
  done < <(git rev-list --all)
fi

if [[ "$REQUIRE_FRESH_ROOT" == "1" ]]; then
  commit_count="$(git rev-list --all --count)"
  if [[ "$commit_count" != "1" ]]; then
    printf 'Fresh public repository must contain exactly one commit; found %s.\n' "$commit_count" >&2
    failed=1
  fi
  author_email="$(git log -1 --format=%ae)"
  if [[ "$author_email" != *@users.noreply.github.com ]]; then
    printf 'Initial public commit must use a GitHub noreply author email.\n' >&2
    failed=1
  fi
fi

if [[ "$failed" != "0" ]]; then exit 1; fi
printf 'PUBLIC_RELEASE_CHECK_OK history=%s fresh_root=%s\n' "$CHECK_HISTORY" "$REQUIRE_FRESH_ROOT"
