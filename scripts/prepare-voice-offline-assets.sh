#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
VOICE_BACKEND_SOURCE="${CLAWMUSE_VOICE_BACKEND_SOURCE:-$HOME/projects/sst&tts/Open-LLM-VTuber}"
OFFLINE_ROOT_SET="${CLAWMUSE_VOICE_OFFLINE_ROOT+x}"
OFFLINE_ROOT="${CLAWMUSE_VOICE_OFFLINE_ROOT:-$HOME/projects/sst&tts/offline}"
ASR_MODEL_ARCHIVE_NAME="sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2"
ASR_MODEL_DOWNLOAD_URL="${CLAWMUSE_VOICE_ASR_MODEL_DOWNLOAD_URL:-https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-zh-en-ja-ko-yue-2024-07-17.tar.bz2}"
ASR_MODEL_MIN_BYTES="${CLAWMUSE_VOICE_ASR_MODEL_MIN_BYTES:-500000000}"

is_valid_runtime() {
  local root="$1"
  [[ -f "$root/python.exe" ]] || return 1
  [[ -f "$root/Lib/encodings/__init__.py" ]] || return 1
  return 0
}

is_windows_mount_path() {
  local path="$1"
  [[ "$path" =~ ^/mnt/[a-zA-Z]/ ]]
}

infer_windows_user_root_from_path() {
  local path="$1"
  if [[ "$path" =~ ^(/mnt/[a-zA-Z]/Users/[^/]+)($|/) ]]; then
    echo "${BASH_REMATCH[1]}"
    return 0
  fi
  return 1
}

download_file() {
  local url="$1"
  local output="$2"
  if command -v curl >/dev/null 2>&1; then
    curl -L --fail "$url" -o "$output"
    return 0
  fi
  if command -v wget >/dev/null 2>&1; then
    wget -O "$output" "$url"
    return 0
  fi
  echo "[prepare][error] neither curl nor wget is available"
  return 1
}

file_size_bytes() {
  local file="$1"
  if stat --version >/dev/null 2>&1; then
    stat -c '%s' "$file"
    return 0
  fi
  wc -c <"$file" | tr -d '[:space:]'
}

find_python_runtime_source() {
  local candidate
  local offline_python_real
  offline_python_real="$(realpath -m "$OFFLINE_ROOT/python")"

  for candidate in \
    "${CLAWMUSE_VOICE_PYTHON_RUNTIME_SOURCE:-}" \
    "$VOICE_BACKEND_SOURCE/python" \
    /mnt/c/Users/*/AppData/Local/Programs/Python/Python* \
    /mnt/c/Users/*/AppData/Roaming/uv/python/*-windows-x86_64-none \
    "$HOME/projects/sst&tts/offline/python"
  do
    [[ -z "$candidate" ]] && continue
    if is_valid_runtime "$candidate"; then
      local candidate_real
      candidate_real="$(realpath -m "$candidate")"
      if [[ "$candidate_real" == "$offline_python_real" ]]; then
        continue
      fi
      echo "$candidate_real"
      return 0
    fi
  done
  return 1
}

if [[ ! -d "$VOICE_BACKEND_SOURCE" ]]; then
  echo "[prepare][error] backend source not found: $VOICE_BACKEND_SOURCE"
  exit 1
fi

PYTHON_RUNTIME_SOURCE="$(find_python_runtime_source || true)"
if [[ -z "$PYTHON_RUNTIME_SOURCE" ]]; then
  echo "[prepare][error] windows python runtime source not found."
  echo "[prepare][error] set CLAWMUSE_VOICE_PYTHON_RUNTIME_SOURCE to a folder containing python.exe"
  exit 1
fi

if [[ -z "$OFFLINE_ROOT_SET" ]] && is_windows_mount_path "$PYTHON_RUNTIME_SOURCE" && ! is_windows_mount_path "$OFFLINE_ROOT"; then
  inferred_windows_user_root="$(infer_windows_user_root_from_path "$PYTHON_RUNTIME_SOURCE" || true)"
  if [[ -n "$inferred_windows_user_root" ]]; then
    OFFLINE_ROOT="$inferred_windows_user_root/projects/sst&tts/offline"
    echo "[prepare] switched offline root to Windows path for python compatibility: $OFFLINE_ROOT"
  fi
fi

OFFLINE_PYTHON_DIR="$OFFLINE_ROOT/python"
OFFLINE_WHEELHOUSE_DIR="$OFFLINE_ROOT/wheelhouse"
OFFLINE_MODELS_DIR="$OFFLINE_ROOT/models"

mkdir -p "$OFFLINE_ROOT" "$OFFLINE_MODELS_DIR"

echo "[prepare] python runtime source: $PYTHON_RUNTIME_SOURCE"
if [[ "$(realpath -m "$PYTHON_RUNTIME_SOURCE")" != "$(realpath -m "$OFFLINE_PYTHON_DIR")" ]]; then
  rm -rf "$OFFLINE_PYTHON_DIR"
  cp -a "$PYTHON_RUNTIME_SOURCE" "$OFFLINE_PYTHON_DIR"
  echo "[prepare] copied python runtime -> $OFFLINE_PYTHON_DIR"
else
  echo "[prepare] python runtime already at offline target, skip copy"
fi

model_archive_path="$OFFLINE_MODELS_DIR/$ASR_MODEL_ARCHIVE_NAME"
need_download_model=0
if [[ ! -f "$model_archive_path" ]]; then
  need_download_model=1
else
  current_size="$(file_size_bytes "$model_archive_path")"
  if [[ "$current_size" -lt "$ASR_MODEL_MIN_BYTES" ]]; then
    echo "[prepare][warn] model archive looks incomplete (${current_size} bytes), will redownload."
    rm -f "$model_archive_path"
    need_download_model=1
  fi
fi

if [[ "$need_download_model" -eq 1 ]]; then
  echo "[prepare] downloading ASR model archive..."
  download_file "$ASR_MODEL_DOWNLOAD_URL" "$model_archive_path"
  echo "[prepare] downloaded model -> $model_archive_path"
else
  echo "[prepare] model archive exists: $model_archive_path"
fi

WINDOWS_PYTHON_EXE="$OFFLINE_PYTHON_DIR/python.exe"
if ! is_valid_runtime "$OFFLINE_PYTHON_DIR"; then
  echo "[prepare][error] copied python runtime is invalid: $OFFLINE_PYTHON_DIR"
  exit 1
fi

if is_windows_mount_path "$WINDOWS_PYTHON_EXE" && ! is_windows_mount_path "$OFFLINE_ROOT"; then
  echo "[prepare][error] windows python cannot bootstrap reliably on non-/mnt path: $OFFLINE_ROOT"
  echo "[prepare][error] set CLAWMUSE_VOICE_OFFLINE_ROOT to a /mnt/<drive>/... directory and retry."
  exit 1
fi

to_windows_path_if_needed() {
  local path="$1"
  if is_windows_mount_path "$WINDOWS_PYTHON_EXE" && command -v wslpath >/dev/null 2>&1; then
    wslpath -w "$path"
    return 0
  fi
  echo "$path"
}

mkdir -p "$OFFLINE_WHEELHOUSE_DIR"

echo "[prepare] ensuring pip..."
if ! "$WINDOWS_PYTHON_EXE" -m pip --version >/dev/null 2>&1; then
  PIP_BREAK_SYSTEM_PACKAGES=true "$WINDOWS_PYTHON_EXE" -m ensurepip --upgrade || true
fi
if ! "$WINDOWS_PYTHON_EXE" -m pip --version >/dev/null 2>&1; then
  echo "[prepare][error] pip is unavailable in bundled python runtime."
  echo "[prepare][error] provide a runtime with pip or set CLAWMUSE_VOICE_PYTHON_RUNTIME_SOURCE accordingly."
  exit 1
fi

requirements_copy_path="$OFFLINE_ROOT/requirements.txt"
cp -f "$VOICE_BACKEND_SOURCE/requirements.txt" "$requirements_copy_path"
requirements_arg="$(to_windows_path_if_needed "$requirements_copy_path")"
wheelhouse_arg="$(to_windows_path_if_needed "$OFFLINE_WHEELHOUSE_DIR")"

echo "[prepare] building wheelhouse from requirements.txt (this may take a while)..."
PIP_BREAK_SYSTEM_PACKAGES=true "$WINDOWS_PYTHON_EXE" -m pip download -r "$requirements_arg" -d "$wheelhouse_arg"

echo "[prepare] done."
echo "[prepare] next: pnpm run pack:win-unpacked:offline"
