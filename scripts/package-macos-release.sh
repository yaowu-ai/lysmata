#!/usr/bin/env bash

set -euo pipefail

: "${TARGET_TRIPLE:?TARGET_TRIPLE is required}"
: "${APP_VERSION:?APP_VERSION is required}"
: "${APPLE_SIGNING_IDENTITY:?APPLE_SIGNING_IDENTITY is required}"
: "${APPLE_ID:?APPLE_ID is required}"
: "${APPLE_PASSWORD:?APPLE_PASSWORD is required}"
: "${APPLE_TEAM_ID:?APPLE_TEAM_ID is required}"
: "${DMG_ARCH_SUFFIX:?DMG_ARCH_SUFFIX is required}"

APP_NAME="Lysmata"
APP_IDENTIFIER="com.yaowutech.lysmata"
SIDECAR_NAME="hono-sidecar"
SIDECAR_IDENTIFIER="${APP_IDENTIFIER}.sidecar"

BUNDLE_ROOT="src-tauri/target/${TARGET_TRIPLE}/release/bundle"
APP_PATH="${BUNDLE_ROOT}/macos/${APP_NAME}.app"
APP_ZIP_PATH="${BUNDLE_ROOT}/macos/${APP_NAME}.zip"
DMG_DIR="${BUNDLE_ROOT}/dmg"
DMG_PATH="${DMG_DIR}/${APP_NAME}_${APP_VERSION}_${DMG_ARCH_SUFFIX}.dmg"
SIDECAR_BUILD_PATH="src-tauri/bin/${SIDECAR_NAME}-${TARGET_TRIPLE}"
SIDECAR_STABLE_PATH="src-tauri/bin/${SIDECAR_NAME}"
SIDECAR_PATH="${APP_PATH}/Contents/MacOS/${SIDECAR_NAME}"

debug_binary() {
  local label="$1"
  local path="$2"

  echo "===== ${label} ====="
  if [[ ! -e "${path}" ]]; then
    echo "missing: ${path}"
    return 0
  fi

  ls -l "${path}" || true
  file "${path}" || true
  xattr -l "${path}" || true
  shasum -a 256 "${path}" || true
  if command -v otool >/dev/null 2>&1; then
    otool -hv "${path}" || true
  fi
  if command -v lipo >/dev/null 2>&1; then
    lipo -info "${path}" || true
  fi
  if command -v codesign >/dev/null 2>&1; then
    codesign -dv --verbose=4 "${path}" || true
  fi
  echo
}

rm -f "${APP_ZIP_PATH}" "${DMG_PATH}"

echo "===== Build environment ====="
uname -a || true
sw_vers || true
xcodebuild -version || true
rustc -Vv || true
bun --version || true
echo "TARGET_TRIPLE=${TARGET_TRIPLE}"
echo

SIDECAR_TARGET="${TARGET_TRIPLE}" CI=true bun run tauri build --bundles app --target "${TARGET_TRIPLE}" --no-sign

debug_binary "sidecar stable binary before bundle" "${SIDECAR_STABLE_PATH}"
debug_binary "sidecar target binary before bundle" "${SIDECAR_BUILD_PATH}"

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Expected app bundle not found: ${APP_PATH}" >&2
  exit 1
fi

if [[ ! -f "${SIDECAR_PATH}" ]]; then
  echo "Expected sidecar not found: ${SIDECAR_PATH}" >&2
  exit 1
fi

debug_binary "bundled sidecar before xattr cleanup" "${SIDECAR_PATH}"

xattr -crs "${APP_PATH}"

debug_binary "bundled sidecar after xattr cleanup" "${SIDECAR_PATH}"

echo "===== Signing sidecar ====="
if ! codesign \
  --force \
  --timestamp \
  --options runtime \
  --sign "${APPLE_SIGNING_IDENTITY}" \
  --identifier "${SIDECAR_IDENTIFIER}" \
  --entitlements src-tauri/SidecarEntitlements.plist \
  "${SIDECAR_PATH}"; then
  echo "Sidecar signing failed, binary diagnostics:" >&2
  debug_binary "bundled sidecar after failed signing" "${SIDECAR_PATH}"
  exit 1
fi

codesign \
  --force \
  --timestamp \
  --options runtime \
  --sign "${APPLE_SIGNING_IDENTITY}" \
  --entitlements src-tauri/Entitlements.plist \
  "${APP_PATH}"

codesign --verify --deep --strict --verbose=2 "${APP_PATH}"

ditto -c -k --keepParent --sequesterRsrc "${APP_PATH}" "${APP_ZIP_PATH}"
xcrun notarytool submit "${APP_ZIP_PATH}" \
  --apple-id "${APPLE_ID}" \
  --password "${APPLE_PASSWORD}" \
  --team-id "${APPLE_TEAM_ID}" \
  --wait
xcrun stapler staple "${APP_PATH}"

mkdir -p "${DMG_DIR}"
STAGING_DIR="$(mktemp -d)"
cleanup() {
  rm -rf "${STAGING_DIR}"
}
trap cleanup EXIT

ditto "${APP_PATH}" "${STAGING_DIR}/${APP_NAME}.app"
ln -s /Applications "${STAGING_DIR}/Applications"

hdiutil create \
  -volname "${APP_NAME}" \
  -srcfolder "${STAGING_DIR}" \
  -ov \
  -format UDZO \
  "${DMG_PATH}"

codesign \
  --force \
  --timestamp \
  --sign "${APPLE_SIGNING_IDENTITY}" \
  "${DMG_PATH}"

xcrun notarytool submit "${DMG_PATH}" \
  --apple-id "${APPLE_ID}" \
  --password "${APPLE_PASSWORD}" \
  --team-id "${APPLE_TEAM_ID}" \
  --wait
xcrun stapler staple "${DMG_PATH}"
