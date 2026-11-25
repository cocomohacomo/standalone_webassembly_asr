#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENGINE_SOURCE_DIR="${ENGINE_SOURCE_DIR:-${ROOT}/vendor/sherpa-embed-asr}"
BUILD_DIR="${BUILD_DIR:-${ROOT}/build-wasm}"
: "${SHERPA_ONNX_ROOT:?Set SHERPA_ONNX_ROOT to an Emscripten-built sherpa-onnx C API install prefix}"

command -v emcmake >/dev/null 2>&1 || {
  echo "emcmake not found. Install and activate emsdk first." >&2
  exit 2
}
test -f "${ENGINE_SOURCE_DIR}/CMakeLists.txt" || {
  echo "Pinned engine checkout not found. Run scripts/clone-engine.sh first." >&2
  exit 3
}
test -f "${SHERPA_ONNX_ROOT}/include/sherpa-onnx/c-api/c-api.h" || {
  echo "Missing sherpa-onnx C API headers under SHERPA_ONNX_ROOT." >&2
  exit 4
}

emcmake cmake -S "${ROOT}/wasm" -B "${BUILD_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DENGINE_SOURCE_DIR="${ENGINE_SOURCE_DIR}" \
  -DSHERPA_ONNX_ROOT="${SHERPA_ONNX_ROOT}" \
  -DCMAKE_CXX_FLAGS_RELEASE="-O3 -DNDEBUG -fexceptions"

cmake --build "${BUILD_DIR}" --parallel "${BUILD_JOBS:-2}"
test -f "${BUILD_DIR}/engine/libsherpa_embed_asr.a"
echo "WASM-target C++ archive built: ${BUILD_DIR}/engine/libsherpa_embed_asr.a"
