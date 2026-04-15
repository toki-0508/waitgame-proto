#!/usr/bin/env bash
set -euo pipefail

# 一時公開（ローカルhttp.server + ngrok）
# 使い方:
#   ./publish_ngrok.sh          # 8080で起動
#   ./publish_ngrok.sh 9090     # ポート指定
#
# 停止: Ctrl+C

PORT="${1:-8080}"
WEB_ADDR="127.0.0.1:4041"

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

cleanup() {
  if [[ -n "${NGROK_PID:-}" ]] && kill -0 "$NGROK_PID" 2>/dev/null; then
    kill "$NGROK_PID" 2>/dev/null || true
  fi
  if [[ -n "${HTTP_PID:-}" ]] && kill -0 "$HTTP_PID" 2>/dev/null; then
    kill "$HTTP_PID" 2>/dev/null || true
  fi
}
trap cleanup EXIT

if ! command -v python3 >/dev/null 2>&1; then
  echo "python3 が見つかりません。先に python3 を入れてください。" >&2
  exit 1
fi
if ! command -v ngrok >/dev/null 2>&1; then
  echo "ngrok が見つかりません。先に ngrok を入れてください。" >&2
  exit 1
fi
if ! command -v curl >/dev/null 2>&1; then
  echo "curl が見つかりません。" >&2
  exit 1
fi

echo "Starting local server: http://127.0.0.1:${PORT}/ (dir: ${DIR})"
python3 -m http.server "$PORT" --bind 127.0.0.1 >/tmp/webgame_http.log 2>&1 &
HTTP_PID="$!"

echo "Starting ngrok tunnel..."
ngrok http "http://127.0.0.1:${PORT}" --web-addr "$WEB_ADDR" --log=stdout >/tmp/webgame_ngrok.log 2>&1 &
NGROK_PID="$!"

API="http://${WEB_ADDR}/api/tunnels"
PUBLIC_URL=""

for _ in $(seq 1 80); do
  if curl -fsS "$API" >/tmp/webgame_ngrok_api.json 2>/dev/null; then
    PUBLIC_URL="$(
      python3 - <<'PY'
import json
from pathlib import Path
data=json.loads(Path("/tmp/webgame_ngrok_api.json").read_text(encoding="utf-8"))
tunnels=data.get("tunnels",[])
https_url=None
http_url=None
for t in tunnels:
  u=t.get("public_url","")
  if u.startswith("https://") and not https_url:
    https_url=u
  if u.startswith("http://") and not http_url:
    http_url=u
print(https_url or http_url or "", end="")
PY
    )"
    if [[ -n "$PUBLIC_URL" ]]; then
      break
    fi
  fi
  sleep 0.15
done

if [[ -z "$PUBLIC_URL" ]]; then
  echo "ngrok のURL取得に失敗しました。ログ: /tmp/webgame_ngrok.log" >&2
  echo "ngrok が既に起動中の場合は止めてから再実行してください。" >&2
  exit 1
fi

echo ""
echo "Public URL:"
echo "  ${PUBLIC_URL}/"
echo ""
echo "Ctrl+C で停止"

wait "$NGROK_PID"
