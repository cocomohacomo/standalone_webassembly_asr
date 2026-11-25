#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SHERPA_REPO="${SHERPA_ONNX_REPO_DIR:-${ROOT}/.cache/sherpa-onnx}"
BUILD_DIR="${SHERPA_ONNX_BUILD_DIR:-${ROOT}/.cache/build-sherpa-onnx-wasm}"
PREFIX="${SHERPA_ONNX_ROOT:-${ROOT}/.cache/sherpa-onnx-wasm}"
SHERPA_ONNX_REF="17d5f144035fb35e13b787445fd3a0100998aa5a"

command -v emcmake >/dev/null 2>&1 || { echo "emcmake not found; activate emsdk first" >&2; exit 2; }
command -v git >/dev/null 2>&1 || { echo "git is required" >&2; exit 2; }

if [[ ! -d "${SHERPA_REPO}/.git" ]]; then
  mkdir -p "$(dirname "${SHERPA_REPO}")"
  git clone --filter=blob:none https://github.com/k2-fsa/sherpa-onnx.git "${SHERPA_REPO}"
fi
git -C "${SHERPA_REPO}" fetch --depth=1 origin "${SHERPA_ONNX_REF}"
git -C "${SHERPA_REPO}" checkout --detach FETCH_HEAD
actual="$(git -C "${SHERPA_REPO}" rev-parse HEAD)"
test "${actual}" = "${SHERPA_ONNX_REF}"

# This builds the real sherpa-onnx C API and its ONNX Runtime WebAssembly
# static dependency set. WASM_ASR is intentionally OFF: we need the reusable
# C API archive, not sherpa-onnx's demo application or its bundled demo model.
export SHERPA_ONNX_IS_USING_BUILD_WASM_SH=ON
emcmake cmake -S "${SHERPA_REPO}" -B "${BUILD_DIR}" \
  -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_INSTALL_PREFIX="${PREFIX}" \
  -DBUILD_SHARED_LIBS=OFF \
  -DSHERPA_ONNX_ENABLE_PYTHON=OFF \
  -DSHERPA_ONNX_ENABLE_TESTS=OFF \
  -DSHERPA_ONNX_ENABLE_CHECK=OFF \
  -DSHERPA_ONNX_ENABLE_PORTAUDIO=OFF \
  -DSHERPA_ONNX_ENABLE_JNI=OFF \
  -DSHERPA_ONNX_ENABLE_C_API=ON \
  -DSHERPA_ONNX_ENABLE_TTS=OFF \
  -DSHERPA_ONNX_ENABLE_WEBSOCKET=OFF \
  -DSHERPA_ONNX_ENABLE_GPU=OFF \
  -DSHERPA_ONNX_ENABLE_WASM=ON \
  -DSHERPA_ONNX_ENABLE_WASM_ASR=OFF \
  -DSHERPA_ONNX_ENABLE_BINARY=OFF \
  -DSHERPA_ONNX_LINK_LIBSTDCPP_STATICALLY=OFF
cmake --build "${BUILD_DIR}" --target sherpa-onnx-c-api --parallel "${BUILD_JOBS:-2}"
cmake --install "${BUILD_DIR}"

test -f "${PREFIX}/include/sherpa-onnx/c-api/c-api.h"
test -f "${PREFIX}/lib/libsherpa-onnx-c-api.a"
test -n "$(find "${PREFIX}/lib" -maxdepth 1 -name 'lib*.a' -print -quit)"
echo "sherpa-onnx C API installed: ${PREFIX}"
echo "Pinned sherpa-onnx revision: ${actual}"
