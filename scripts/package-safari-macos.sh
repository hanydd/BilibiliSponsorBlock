#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

# Keep CI output separate from the Xcode project used for local development.
export BSB_SAFARI_PROJECT_DIR="safari/ci"
export BSB_SAFARI_APP_NAME="BilibiliSponsorBlock"
bash scripts/build-safari-macos.sh

DERIVED_DATA="$ROOT_DIR/safari/ci-derived-data"
APP_PATH="$DERIVED_DATA/Build/Products/Release/BilibiliSponsorBlock.app"
ARTIFACT_DIR="$ROOT_DIR/safari/artifacts"

xcodebuild \
    -project "$BSB_SAFARI_PROJECT_DIR/$BSB_SAFARI_APP_NAME/$BSB_SAFARI_APP_NAME.xcodeproj" \
    -scheme "$BSB_SAFARI_APP_NAME" \
    -configuration Release \
    -destination 'generic/platform=macOS' \
    -derivedDataPath "$DERIVED_DATA" \
    ARCHS='arm64 x86_64' \
    ONLY_ACTIVE_ARCH=NO \
    CODE_SIGN_IDENTITY=- \
    CODE_SIGN_STYLE=Manual \
    DEVELOPMENT_TEAM= \
    build

# Verify both the host app and embedded extension before publishing the artifact.
codesign --verify --deep --strict "$APP_PATH"
lipo "$APP_PATH/Contents/MacOS/BilibiliSponsorBlock" -verify_arch arm64 x86_64
for extension in "$APP_PATH"/Contents/PlugIns/*.appex; do
    executable=$(/usr/libexec/PlistBuddy -c 'Print :CFBundleExecutable' "$extension/Contents/Info.plist")
    lipo "$extension/Contents/MacOS/$executable" -verify_arch arm64 x86_64
done

mkdir -p "$ARTIFACT_DIR"
# Zip with ditto to preserve executable permissions and bundle metadata.
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" "$ARTIFACT_DIR/Safari-macOS-universal.zip"
echo "Safari 测试应用：$ARTIFACT_DIR/Safari-macOS-universal.zip（ad-hoc 签名，未公证）"
