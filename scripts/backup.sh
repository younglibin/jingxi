#!/usr/bin/env bash
set -euo pipefail
project_dir="$(cd "$(dirname "$0")/.." && pwd)"
storage_dir="${STORAGE_ROOT:-$project_dir/storage}"
[[ -f "$storage_dir/data/store.json" ]] || { echo '缺少 storage/data/store.json，拒绝创建空备份。' >&2; exit 1; }
storage_dir="$(cd "$storage_dir" && pwd)"
destination="${1:-$storage_dir/backups}"
was_running=false
restart_api() {
  if $was_running; then
    (cd "$project_dir" && docker compose start api >/dev/null) || echo '备份后 API 启动失败，请执行 docker compose up -d。' >&2
  fi
}
trap restart_api EXIT
if [[ "${BACKUP_OFFLINE:-0}" != 1 ]]; then
  command -v docker >/dev/null || { echo '请先安装 Docker；手动停服后可用 BACKUP_OFFLINE=1 备份。' >&2; exit 1; }
  docker info >/dev/null 2>&1 || { echo 'Docker 引擎不可用，未开始备份。' >&2; exit 1; }
  cd "$project_dir"
  container_id="$(docker compose ps -q api)"
  if [[ -n "$container_id" ]] && [[ "$(docker inspect -f '{{.State.Running}}' "$container_id")" == true ]]; then
    was_running=true
    docker compose stop api >/dev/null
  fi
fi
mkdir -p "$destination"
archive="$destination/jingxi-$(date -u +%Y%m%dT%H%M%SZ)-$$.tar.gz"
tar -czf "$archive" -C "$storage_dir" data/store.json images/originals images/display
if command -v sha256sum >/dev/null; then
  sha256sum "$archive" > "$archive.sha256"
else
  shasum -a 256 "$archive" > "$archive.sha256"
fi
printf '%s\n' "$archive"
