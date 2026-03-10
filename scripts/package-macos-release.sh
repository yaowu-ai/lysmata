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
SIDECAR_PATH="${APP_PATH}/Contents/MacOS/${SIDECAR_NAME}"

rm -f "${APP_ZIP_PATH}" "${DMG_PATH}"

SIDECAR_TARGET="${TARGET_TRIPLE}" CI=true bun run tauri build --bundles app --target "${TARGET_TRIPLE}" --no-sign

if [[ ! -d "${APP_PATH}" ]]; then
  echo "Expected app bundle not found: ${APP_PATH}" >&2
  exit 1
fi

if [[ ! -f "${SIDECAR_PATH}" ]]; then
  echo "Expected sidecar not found: ${SIDECAR_PATH}" >&2
  exit 1
fi

xattr -crs "${APP_PATH}"

codesign \
  --force \
  --timestamp \
  --options runtime \
  --sign "${APPLE_SIGNING_IDENTITY}" \
  --identifier "${SIDECAR_IDENTIFIER}" \
  --entitlements src-tauri/SidecarEntitlements.plist \
  "${SIDECAR_PATH}"

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
