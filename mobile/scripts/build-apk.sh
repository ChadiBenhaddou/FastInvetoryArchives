#!/bin/sh
# Builds the signed release APK. Runs inside the android-builder image
# (see scripts/build-apk.ps1 / build-apk.sh at the repository root).
set -e
cd /repo/mobile

KEYSTORE_DIR=keystore
PROPS=$KEYSTORE_DIR/keystore.properties

# 1. Release signing key, created once. Android refuses to install an update signed
#    with a different key, so this folder MUST be backed up (see README).
if [ ! -f "$PROPS" ]; then
  echo ">> Creating the release signing key in mobile/$KEYSTORE_DIR (back it up!)"
  mkdir -p "$KEYSTORE_DIR"
  PASS=$(head -c 24 /dev/urandom | base64 | tr -d '\n+/=')
  keytool -genkeypair -noprompt -keystore "$KEYSTORE_DIR/release.jks" -storetype PKCS12 \
    -alias archive-capture -keyalg RSA -keysize 3072 -validity 10000 \
    -storepass "$PASS" -keypass "$PASS" -dname "CN=Archive Inventory, O=Archive Inventory"
  printf 'storeFile=release.jks\nstorePassword=%s\nkeyAlias=archive-capture\nkeyPassword=%s\n' "$PASS" "$PASS" > "$PROPS"
fi

echo ">> Installing dependencies"
npm ci --no-audit --no-fund
echo ">> Unit tests"
npx vitest run
echo ">> Web build"
npm run build
echo ">> Capacitor sync"
npx cap sync android
echo ">> Gradle release build"
cd android
chmod +x gradlew
./gradlew --no-daemon assembleRelease
cd ..

VERSION=$(node -p "require('./package.json').version")
mkdir -p release
OUT=release/archive-capture-$VERSION.apk
cp android/app/build/outputs/apk/release/app-release.apk "$OUT"
sha256sum "$OUT" | sed 's|release/||' > "$OUT.sha256"
echo ">> APK ready: mobile/$OUT"
cat "$OUT.sha256"
