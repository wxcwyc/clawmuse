#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
TMP_APP_DIR="/tmp/clawmuse-pack-app"
BUNDLE_VOICE_BACKEND="${CLAWMUSE_BUNDLE_VOICE_BACKEND:-0}"
VOICE_BACKEND_SOURCE_DEFAULT="$HOME/projects/sst&tts/Open-LLM-VTuber"
VOICE_BACKEND_SOURCE="${CLAWMUSE_VOICE_BACKEND_SOURCE:-$VOICE_BACKEND_SOURCE_DEFAULT}"
VOICE_BACKEND_TARGET_REL="voice-backend/Open-LLM-VTuber"
BUNDLE_COSYVOICE_BACKEND="${CLAWMUSE_BUNDLE_COSYVOICE_BACKEND:-0}"
COSYVOICE_BACKEND_SOURCE_DEFAULT="$HOME/projects/sst&tts/CosyVoice"
COSYVOICE_BACKEND_SOURCE="${CLAWMUSE_COSYVOICE_BACKEND_SOURCE:-$COSYVOICE_BACKEND_SOURCE_DEFAULT}"
COSYVOICE_BACKEND_TARGET_REL="voice-backend/CosyVoice"
BUNDLE_ASR_MODEL="${CLAWMUSE_BUNDLE_ASR_MODEL:-0}"
ASR_MODEL_ARCHIVE_NAME="sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"
ASR_MODEL_DIR_NAME="sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17"
ASR_MODEL_ARCHIVE_SOURCE="${CLAWMUSE_VOICE_ASR_MODEL_ARCHIVE_SOURCE:-}"
ASR_MODEL_DIR_SOURCE="${CLAWMUSE_VOICE_ASR_MODEL_DIR_SOURCE:-}"
BUNDLE_PYTHON_RUNTIME="${CLAWMUSE_BUNDLE_PYTHON_RUNTIME:-0}"
VOICE_PYTHON_RUNTIME_SOURCE="${CLAWMUSE_VOICE_PYTHON_RUNTIME_SOURCE:-}"
BUNDLE_WHEELHOUSE="${CLAWMUSE_BUNDLE_WHEELHOUSE:-0}"
VOICE_WHEELHOUSE_SOURCE="${CLAWMUSE_VOICE_WHEELHOUSE_SOURCE:-}"
BUNDLE_STRICT="${CLAWMUSE_VOICE_BUNDLE_STRICT:-0}"

is_disabled() {
  local value="${1:-}"
  [[ "$value" == "0" || "$value" == "false" ]]
}

is_enabled() {
  ! is_disabled "$1"
}

warn_or_fail() {
  local message="$1"
  if is_enabled "$BUNDLE_STRICT"; then
    echo "[pack][error] $message"
    exit 1
  fi
  echo "[pack][warn] $message"
}

cd "$ROOT_DIR"

corepack pnpm run build:desktop-electron

rm -rf "$TMP_APP_DIR"
mkdir -p "$TMP_APP_DIR"
cp -a out "$TMP_APP_DIR/"

cat > "$TMP_APP_DIR/package.json" <<'JSON'
{
  "name": "clawmuse-diag",
  "version": "0.1.0",
  "type": "module",
  "main": "out/main/index.js"
}
JSON

corepack pnpm exec electron-packager "$TMP_APP_DIR" ClawMuseDiag \
  --platform=win32 \
  --arch=x64 \
  --out=dist \
  --overwrite \
  --asar \
  --electron-version=40.8.0 \
  --electron-zip-dir="$HOME/.cache/electron" \
  --executable-name=ClawMuseDiag

if is_enabled "$BUNDLE_VOICE_BACKEND"; then
  VOICE_BACKEND_TARGET="dist/ClawMuseDiag-win32-x64/$VOICE_BACKEND_TARGET_REL"
  if [[ -d "$VOICE_BACKEND_SOURCE" ]]; then
    mkdir -p "$VOICE_BACKEND_TARGET"
    rsync -a --delete \
      --exclude='.git/' \
      --exclude='.github/' \
      --exclude='.cursor/' \
      --exclude='.gemini/' \
      --exclude='__pycache__/' \
      --exclude='.pytest_cache/' \
      --exclude='.venv/' \
      --exclude='node_modules/' \
      "$VOICE_BACKEND_SOURCE/" "$VOICE_BACKEND_TARGET/"
    echo "[pack] bundled voice backend: $VOICE_BACKEND_SOURCE -> $VOICE_BACKEND_TARGET"

    if is_enabled "$BUNDLE_ASR_MODEL"; then
      MODEL_TARGET_DIR="$VOICE_BACKEND_TARGET/models"
      mkdir -p "$MODEL_TARGET_DIR"

      if [[ -z "$ASR_MODEL_ARCHIVE_SOURCE" ]]; then
        for candidate in \
          "$VOICE_BACKEND_SOURCE/models/$ASR_MODEL_ARCHIVE_NAME" \
          "$HOME/projects/sst&tts/offline/models/$ASR_MODEL_ARCHIVE_NAME" \
          /mnt/c/Users/*/projects/sst\&tts/offline/models/"$ASR_MODEL_ARCHIVE_NAME" \
          /mnt/c/Users/*/Downloads/"$ASR_MODEL_ARCHIVE_NAME" \
          /mnt/c/Users/*/Desktop/"$ASR_MODEL_ARCHIVE_NAME" \
          "$HOME/Downloads/$ASR_MODEL_ARCHIVE_NAME" \
          "$HOME/$ASR_MODEL_ARCHIVE_NAME"
        do
          if [[ -f "$candidate" ]]; then
            ASR_MODEL_ARCHIVE_SOURCE="$candidate"
            break
          fi
        done
      fi

      if [[ -n "$ASR_MODEL_ARCHIVE_SOURCE" && -f "$ASR_MODEL_ARCHIVE_SOURCE" ]]; then
        cp -f "$ASR_MODEL_ARCHIVE_SOURCE" "$MODEL_TARGET_DIR/$ASR_MODEL_ARCHIVE_NAME"
        echo "[pack] bundled ASR model archive: $ASR_MODEL_ARCHIVE_SOURCE -> $MODEL_TARGET_DIR/$ASR_MODEL_ARCHIVE_NAME"
      fi

      if [[ -z "$ASR_MODEL_DIR_SOURCE" ]]; then
        for candidate in \
          "$VOICE_BACKEND_SOURCE/models/$ASR_MODEL_DIR_NAME" \
          "$HOME/projects/sst&tts/offline/models/$ASR_MODEL_DIR_NAME" \
          /mnt/c/Users/*/projects/sst\&tts/offline/models/"$ASR_MODEL_DIR_NAME" \
          /mnt/c/Users/*/Downloads/"$ASR_MODEL_DIR_NAME" \
          /mnt/c/Users/*/Desktop/"$ASR_MODEL_DIR_NAME" \
          "$HOME/Downloads/$ASR_MODEL_DIR_NAME" \
          "$HOME/$ASR_MODEL_DIR_NAME"
        do
          if [[ -d "$candidate" ]]; then
            ASR_MODEL_DIR_SOURCE="$candidate"
            break
          fi
        done
      fi

      if [[ -n "$ASR_MODEL_DIR_SOURCE" && -d "$ASR_MODEL_DIR_SOURCE" ]]; then
        rm -rf "$MODEL_TARGET_DIR/$ASR_MODEL_DIR_NAME"
        cp -a "$ASR_MODEL_DIR_SOURCE" "$MODEL_TARGET_DIR/$ASR_MODEL_DIR_NAME"
        echo "[pack] bundled ASR model directory: $ASR_MODEL_DIR_SOURCE -> $MODEL_TARGET_DIR/$ASR_MODEL_DIR_NAME"
      fi

      if [[ ! -f "$MODEL_TARGET_DIR/$ASR_MODEL_ARCHIVE_NAME" && ! -d "$MODEL_TARGET_DIR/$ASR_MODEL_DIR_NAME" ]]; then
        warn_or_fail "ASR model not bundled; set CLAWMUSE_VOICE_ASR_MODEL_ARCHIVE_SOURCE or CLAWMUSE_VOICE_ASR_MODEL_DIR_SOURCE."
        if ! is_enabled "$BUNDLE_STRICT"; then
          echo "[pack][warn] first run may download ~1GB."
        fi
      fi
    else
      echo "[pack] skipped ASR model bundle (CLAWMUSE_BUNDLE_ASR_MODEL=$BUNDLE_ASR_MODEL)"
    fi

    if is_enabled "$BUNDLE_PYTHON_RUNTIME"; then
      if [[ -z "$VOICE_PYTHON_RUNTIME_SOURCE" ]]; then
        for candidate in \
          "$VOICE_BACKEND_SOURCE/python" \
          "$HOME/projects/sst&tts/offline/python" \
          /mnt/c/Users/*/projects/sst\&tts/offline/python \
          /mnt/c/Users/*/AppData/Local/Programs/Python/Python* \
          /mnt/c/Users/*/AppData/Roaming/uv/python/*-windows-x86_64-none
        do
          if [[ -d "$candidate" ]]; then
            VOICE_PYTHON_RUNTIME_SOURCE="$candidate"
            break
          fi
        done
      fi

      if [[ -n "$VOICE_PYTHON_RUNTIME_SOURCE" && -d "$VOICE_PYTHON_RUNTIME_SOURCE" ]]; then
        rm -rf "$VOICE_BACKEND_TARGET/python"
        cp -a "$VOICE_PYTHON_RUNTIME_SOURCE" "$VOICE_BACKEND_TARGET/python"
        echo "[pack] bundled python runtime: $VOICE_PYTHON_RUNTIME_SOURCE -> $VOICE_BACKEND_TARGET/python"
      else
        warn_or_fail "python runtime bundle requested but source not found (set CLAWMUSE_VOICE_PYTHON_RUNTIME_SOURCE)."
      fi
    else
      echo "[pack] skipped python runtime bundle (CLAWMUSE_BUNDLE_PYTHON_RUNTIME=$BUNDLE_PYTHON_RUNTIME)"
    fi

    if is_enabled "$BUNDLE_WHEELHOUSE"; then
      if [[ -z "$VOICE_WHEELHOUSE_SOURCE" ]]; then
        for candidate in \
          "$VOICE_BACKEND_SOURCE/wheelhouse" \
          "$HOME/projects/sst&tts/offline/wheelhouse" \
          /mnt/c/Users/*/projects/sst\&tts/offline/wheelhouse \
          /mnt/c/Users/*/Desktop/sst\&tts/offline/wheelhouse
        do
          if [[ -d "$candidate" ]]; then
            VOICE_WHEELHOUSE_SOURCE="$candidate"
            break
          fi
        done
      fi

      if [[ -n "$VOICE_WHEELHOUSE_SOURCE" && -d "$VOICE_WHEELHOUSE_SOURCE" ]]; then
        rm -rf "$VOICE_BACKEND_TARGET/wheelhouse"
        mkdir -p "$VOICE_BACKEND_TARGET/wheelhouse"
        rsync -a --delete "$VOICE_WHEELHOUSE_SOURCE/" "$VOICE_BACKEND_TARGET/wheelhouse/"
        echo "[pack] bundled wheelhouse: $VOICE_WHEELHOUSE_SOURCE -> $VOICE_BACKEND_TARGET/wheelhouse"
      else
        warn_or_fail "wheelhouse bundle requested but source not found (set CLAWMUSE_VOICE_WHEELHOUSE_SOURCE)."
      fi
    else
      echo "[pack] skipped wheelhouse bundle (CLAWMUSE_BUNDLE_WHEELHOUSE=$BUNDLE_WHEELHOUSE)"
    fi
  else
    warn_or_fail "voice backend source not found: $VOICE_BACKEND_SOURCE (set CLAWMUSE_VOICE_BACKEND_SOURCE)."
  fi
else
  echo "[pack] skipped voice backend bundle (CLAWMUSE_BUNDLE_VOICE_BACKEND=$BUNDLE_VOICE_BACKEND)"
fi

if is_enabled "$BUNDLE_COSYVOICE_BACKEND"; then
  COSYVOICE_BACKEND_TARGET="dist/ClawMuseDiag-win32-x64/$COSYVOICE_BACKEND_TARGET_REL"
  if [[ -d "$COSYVOICE_BACKEND_SOURCE" ]]; then
    mkdir -p "$COSYVOICE_BACKEND_TARGET"
    rsync -a --delete \
      --exclude='.git/' \
      --exclude='.github/' \
      --exclude='.cursor/' \
      --exclude='.gemini/' \
      --exclude='__pycache__/' \
      --exclude='.pytest_cache/' \
      --exclude='.venv/' \
      --exclude='node_modules/' \
      "$COSYVOICE_BACKEND_SOURCE/" "$COSYVOICE_BACKEND_TARGET/"
    echo "[pack] bundled cosyvoice backend: $COSYVOICE_BACKEND_SOURCE -> $COSYVOICE_BACKEND_TARGET"
  else
    warn_or_fail "cosyvoice backend source not found: $COSYVOICE_BACKEND_SOURCE (set CLAWMUSE_COSYVOICE_BACKEND_SOURCE)."
  fi
else
  echo "[pack] skipped cosyvoice backend bundle (CLAWMUSE_BUNDLE_COSYVOICE_BACKEND=$BUNDLE_COSYVOICE_BACKEND)"
fi

rm -rf dist/win-unpacked
cp -a dist/ClawMuseDiag-win32-x64 dist/win-unpacked

echo "[pack] done: dist/win-unpacked/ClawMuseDiag.exe"
