#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

if ! command -v xcrun >/dev/null 2>&1; then
    echo "error: xcrun 未安装。请先安装 Xcode 或 Xcode Command Line Tools。"
    exit 1
fi

APP_NAME="${BSB_SAFARI_APP_NAME:-BilibiliSponsorBlock}"
BUNDLE_ID="${BSB_SAFARI_BUNDLE_ID:-top.bsbsb.BilibiliSponsorBlock}"
PROJECT_DIR="${BSB_SAFARI_PROJECT_DIR:-safari}"

npm run build:safari

xcrun safari-web-extension-converter \
    dist \
    --project-location "$PROJECT_DIR" \
    --app-name "$APP_NAME" \
    --bundle-identifier "$BUNDLE_ID" \
    --swift \
    --macos-only \
    --copy-resources \
    --no-open \
    --no-prompt \
    --force

echo "Safari macOS 工程已生成：$PROJECT_DIR"
echo "下一步：用 Xcode 打开该工程，选择 Mac target 后 Build/Run。"
