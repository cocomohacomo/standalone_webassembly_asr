#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_SOURCE_DIR="${ENGINE_SOURCE_DIR:-${ROOT}/vendor/sherpa-embed-asr}"
BUILD_DIR="${BUILD_DIR:-${ROOT}/build-wasm}"
SHERPA_ONNX_ROOT="${SHERPA_ONNX_ROOT:-${ROOT}/.cache/sherpa-onnx-wasm}"

command -v emcmake >/dev/null 2>&1 || { echo "emcmake not found; activate emsdk first" >&2; exit 2; }
test -f "${ENGINE_SOURCE_DIR}/CMakeLists.txt" || { echo "Pinned engine checkout missing; run scripts/clone-engine.sh" >&2; exit 3; }

if [[ ! -f "${SHERPA_ONNX_ROOT}/lib/libsherpa-onnx-c-api.a" ]]; then
  echo "Building pinned sherpa-onnx C API and ONNX Runtime WASM archives..."
  SHERPA_ONNX_ROOT="${SHERPA_ONNX_ROOT}" "${ROOT}/scripts/build-sherpa-onnx-wasm.sh"
fi
test -f "${SHERPA_ONNX_ROOT}/include/sherpa-onnx/c-api/c-api.h"
test -f "${SHERPA_ONNX_ROOT}/lib/libsherpa-onnx-c-api.a"

emcmake cmake -S "${ROOT}/wasm" -B "${BUILD_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DENGINE_SOURCE_DIR="${ENGINE_SOURCE_DIR}" \
  -DSHERPA_ONNX_ROOT="${SHERPA_ONNX_ROOT}" \
  -DCMAKE_CXX_FLAGS_RELEASE="-O3 -DNDEBUG -fexceptions"

cmake --build "${BUILD_DIR}" --target sherpa_embed_asr_wasm --parallel "${BUILD_JOBS:-2}"
test -f "${BUILD_DIR}/sherpa_embed_asr_wasm.js"
test -f "${BUILD_DIR}/sherpa_embed_asr_wasm.wasm"
echo "Final Emscripten module built: ${BUILD_DIR}/sherpa_embed_asr_wasm.js"
