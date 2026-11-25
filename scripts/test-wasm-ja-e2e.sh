#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CACHE="${ROOT}/.cache/ja-model"
ARCHIVE="${CACHE}/ja-model.tar.bz2"
URL="https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01.tar.bz2"
mkdir -p "${CACHE}"
if [[ ! -f "${CACHE}/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01/encoder-epoch-99-avg-1.int8.onnx" ]]; then
  curl --fail --location --retry 3 "${URL}" -o "${ARCHIVE}"
  tar -xjf "${ARCHIVE}" -C "${CACHE}"
  rm -f "${ARCHIVE}"
fi
if [[ ! -f "${CACHE}/silero_vad.onnx" ]]; then
  curl --fail --location --retry 3 \
    "https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/silero_vad.onnx" \
    -o "${CACHE}/silero_vad.onnx"
fi
node "${ROOT}/tests/wasm-ja-e2e.cjs"
