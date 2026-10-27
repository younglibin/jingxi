#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
java_cmd="${JAVA_HOME:+$JAVA_HOME/bin/}java"
[[ -f apps/api/target/api.jar ]] || { echo '请先构建 apps/api/target/api.jar。' >&2; exit 1; }
e2e_storage="$(mktemp -d "${TMPDIR:-/tmp}/jingxi-e2e.XXXXXX")"
api_pid=''
cleanup() {
  if [[ -n "$api_pid" ]]; then kill "$api_pid" 2>/dev/null || true; wait "$api_pid" 2>/dev/null || true; fi
  rm -rf "$e2e_storage"
}
trap cleanup EXIT INT TERM
hash="$(printf '%s\n' "${E2E_ADMIN_PASSWORD:-Tdd-e2e-only-password-2026}" | "$java_cmd" -jar apps/api/target/api.jar --hash-password | tail -n 1)"
[[ "$hash" == \$2* ]] || { echo '测试密码哈希生成失败。' >&2; exit 1; }
SERVER_PORT=18081 STORAGE_ROOT="$e2e_storage" ADMIN_USERNAME=e2e-admin ADMIN_PASSWORD_HASH="$hash" COOKIE_SECURE=false "$java_cmd" -jar apps/api/target/api.jar > "$e2e_storage/api.log" 2>&1 &
api_pid=$!
for attempt in $(seq 1 90); do
  if curl -fsS http://127.0.0.1:18081/api/health >/dev/null 2>&1; then break; fi
  if ! kill -0 "$api_pid" 2>/dev/null; then cat "$e2e_storage/api.log" >&2; exit 1; fi
  sleep 1
done
curl -fsS http://127.0.0.1:18081/api/health >/dev/null
API_BASE=http://127.0.0.1:18081 npm run test:e2e
