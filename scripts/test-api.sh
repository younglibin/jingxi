#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/../apps/api"
goal="${1:-test}"
if [[ -n "${MAVEN_CMD:-}" ]]; then
  exec "$MAVEN_CMD" -B "$goal"
elif [[ -x ./mvnw ]]; then
  exec ./mvnw -B "$goal"
elif command -v mvn >/dev/null; then
  exec mvn -B "$goal"
else
  echo '后端测试需要 Java 21 和 Maven。也可 docker compose build api 在构建阶段运行测试。' >&2
  exit 1
fi
