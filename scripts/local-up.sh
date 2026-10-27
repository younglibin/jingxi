#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
command -v docker >/dev/null || { echo '请先安装并启动 Docker Desktop。' >&2; exit 1; }
docker info >/dev/null 2>&1 || { echo 'Docker 引擎未运行或当前账号无权访问。' >&2; exit 1; }
docker compose version >/dev/null
mkdir -p storage/data storage/images/originals storage/images/display storage/images/tmp storage/backups storage/logs
has_hash=false
if [[ -f .env ]] && grep -Eq '^ADMIN_PASSWORD_HASH=.*[$]2[aby][$][0-9]' .env; then has_hash=true; fi
if ! $has_hash; then
  admin_user="${ADMIN_USERNAME:-admin}"
  [[ "$admin_user" =~ ^[a-zA-Z0-9._-]{1,40}$ ]] || { echo '用户名仅允许字母、数字、点、下划线和短横线。' >&2; exit 1; }
  if [[ -z "${ADMIN_PASSWORD:-}" ]]; then
    read -r -s -p '设置本地管理员密码（至少 12 位）: ' admin_pass
    echo
    read -r -s -p '再次输入密码: ' admin_confirm
    echo
    [[ "$admin_pass" == "$admin_confirm" ]] || { echo '两次密码不一致。' >&2; exit 1; }
  else
    admin_pass="$ADMIN_PASSWORD"
  fi
  [[ ${#admin_pass} -ge 12 && $(printf '%s' "$admin_pass" | wc -c | tr -d ' ') -le 72 ]] || { echo '密码至少12位，UTF-8编码不超过72字节。' >&2; exit 1; }
  docker compose build api
  pass_hash="$(printf '%s\n' "$admin_pass" | docker compose run --rm --no-deps -T api --hash-password | tr -d '\r' | tail -n 1)"
  [[ "$pass_hash" == \$2* ]] || { echo '密码哈希生成失败，未写入配置。' >&2; exit 1; }
  umask 077
  {
    printf 'PORT=%s\n' "${PORT:-18080}"
    printf 'ADMIN_USERNAME=%s\n' "$admin_user"
    printf "ADMIN_PASSWORD_HASH='%s'\n" "$pass_hash"
    printf 'LOCAL_UID=%s\nLOCAL_GID=%s\n' "$(id -u)" "$(id -g)"
  } > .env
  unset admin_pass admin_confirm pass_hash
fi
docker compose config --quiet
docker compose up -d --build --wait
printf '\nDocker 服务已启动。访问端口以 .env 中 PORT 为准，默认 http://localhost:18080\n'
docker compose ps
