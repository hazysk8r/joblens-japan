#!/usr/bin/env bash
set -euo pipefail

# ローカルのComposeプロジェクトを誤って削除しない。
if [[ ! "${COMPOSE_PROJECT_NAME:-}" =~ ^joblens-ci-[a-z0-9][a-z0-9_-]*$ ]]; then
  echo "COMPOSE_PROJECT_NAME must start with joblens-ci- and use a unique CI suffix." >&2
  exit 1
fi
if [[ -z "${SMOKE_LOG_DIR:-}" ]]; then
  : "${RUNNER_TEMP:?RUNNER_TEMP or SMOKE_LOG_DIR is required}"
  SMOKE_LOG_DIR="$RUNNER_TEMP/docker-smoke"
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
repo_root="$(cd -- "$script_dir/../.." && pwd)"
cd "$repo_root"

mkdir -p "$SMOKE_LOG_DIR"
# 個人の.envを読み込まず、Jobに指定したCI専用の環境変数を使用する。
: > "$SMOKE_LOG_DIR/empty.env"
compose=(docker compose --env-file "$SMOKE_LOG_DIR/empty.env"
  -f docker-compose.yml -f .github/docker-compose.smoke.yml)

case "${1:-}" in
  start)
    {
      docker compose version
      "${compose[@]}" config --quiet
    } 2>&1 | tee "$SMOKE_LOG_DIR/compose.log"
    "${compose[@]}" build 2>&1 | tee "$SMOKE_LOG_DIR/build.log"
    "${compose[@]}" up -d --no-build --wait --wait-timeout 180 \
      2>&1 | tee "$SMOKE_LOG_DIR/startup.log"
    ;;
  check)
    frontend_address="$("${compose[@]}" port frontend 80)"
    python_bin="${PYTHON_BIN:-python3}"
    "$python_bin" "$script_dir/check_docker_smoke.py" \
      --base-url "http://$frontend_address" \
      2>&1 | tee "$SMOKE_LOG_DIR/http.log"
    ;;
  diagnostics)
    "${compose[@]}" ps --all --format json \
      > "$SMOKE_LOG_DIR/containers.json" 2>&1 || true
    "${compose[@]}" logs --no-color --timestamps \
      > "$SMOKE_LOG_DIR/services.log" 2>&1 || true
    # 環境変数を含む全inspectではなく、起動状態とHealthcheck結果だけを保存する。
    while IFS= read -r container_id; do
      if [[ -n "$container_id" ]]; then
        docker inspect --format '{{json .State}}' "$container_id" || true
      fi
    done < <("${compose[@]}" ps --all --quiet) \
      > "$SMOKE_LOG_DIR/health.jsonl" 2>&1
    ;;
  cleanup)
    # CI専用プロジェクトの資源だけを対象にする。共有のベースイメージは削除しない。
    "${compose[@]}" down --volumes --remove-orphans --rmi local --timeout 10 \
      2>&1 | tee "$SMOKE_LOG_DIR/cleanup.log"
    ;;
  *)
    echo "Usage: bash scripts/ci/docker-smoke.sh {start|check|diagnostics|cleanup}" >&2
    exit 2
    ;;
esac
