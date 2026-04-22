#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

export CLAWMUSE_VOICE_BUNDLE_STRICT=1
export CLAWMUSE_BUNDLE_VOICE_BACKEND=1
export CLAWMUSE_BUNDLE_COSYVOICE_BACKEND=1
export CLAWMUSE_BUNDLE_PYTHON_RUNTIME=1
export CLAWMUSE_BUNDLE_WHEELHOUSE=1
export CLAWMUSE_BUNDLE_ASR_MODEL=1

bash scripts/pack-win-unpacked.sh
