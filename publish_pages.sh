#!/usr/bin/env bash
set -euo pipefail

# GitHub Pages で恒久公開する（webgame/ をリポジトリとして公開）
#
# 使い方:
#   ./publish_pages.sh waitgame-proto
#   ./publish_pages.sh owner/repo
#
# 前提:
#   - gh がログイン済み（公開したいアカウントで）
#   - このディレクトリが git repo（なければ `git init` してから）

REPO_INPUT="${1:-}"
if [[ -z "$REPO_INPUT" ]]; then
  echo "Usage: ./publish_pages.sh <repo>  (ex: waitgame-proto  or  owner/repo)" >&2
  exit 1
fi

DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$DIR"

if ! command -v gh >/dev/null 2>&1; then
  echo "gh が見つかりません。GitHub CLI を入れてください。" >&2
  exit 1
fi
if ! command -v git >/dev/null 2>&1; then
  echo "git が見つかりません。" >&2
  exit 1
fi

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "このフォルダは git 管理されていません。先に \`git init\` してください。" >&2
  exit 1
fi

OWNER=""
REPO_NAME=""
if [[ "$REPO_INPUT" == */* ]]; then
  OWNER="${REPO_INPUT%%/*}"
  REPO_NAME="${REPO_INPUT##*/}"
else
  OWNER="$(gh api user --jq .login)"
  REPO_NAME="$REPO_INPUT"
fi

FULL="${OWNER}/${REPO_NAME}"
echo "Target: ${FULL}"

# main ブランチを前提
git branch -M main >/dev/null 2>&1 || true

# remote origin があれば上書きしない（誤爆防止）
if git remote get-url origin >/dev/null 2>&1; then
  echo "ERROR: remote 'origin' が既にあります。誤って別repoにpushしないため停止します。" >&2
  echo "  現在のorigin: $(git remote get-url origin)" >&2
  echo "  必要なら: git remote remove origin" >&2
  exit 1
fi

# repo 作成 & push
echo "Creating repo (if needed) & pushing..."
gh repo create "$FULL" --public --source=. --remote=origin --push

# Pages 有効化（既に有効なら無視）
echo "Enabling GitHub Pages..."
if ! gh api repos/"$FULL"/pages >/dev/null 2>&1; then
  gh api -X POST repos/"$FULL"/pages -f 'source[branch]=main' -f 'source[path]=/' --silent
fi

PAGES_URL="$(gh api repos/"$FULL"/pages --jq .html_url 2>/dev/null || true)"
STATUS="$(gh api repos/"$FULL"/pages --jq .status 2>/dev/null || true)"
echo ""
echo "Pages:"
echo "  URL: ${PAGES_URL:-'(not ready yet)'}"
echo "  status: ${STATUS:-'(unknown)'}"
echo ""
echo "反映が遅い場合は、GitHubの Settings → Pages を確認してください。"

