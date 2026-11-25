# Emscripten build (application-owned)

This build consumes the pinned private engine checkout and never edits
`vendor/sherpa-embed-asr`. CMake copies it into the build directory and applies
two build-only adaptations there:

1. Build `sherpa_embed_asr` as a static archive instead of a native shared library.
2. Skip the ELF version-script linker flags, which do not apply to Emscripten.

## Prerequisites

- Emscripten SDK activated in the shell (`emcmake` available).
- The pinned engine checkout (`scripts/clone-engine.sh`).
- An Emscripten-built **sherpa-onnx C API** prefix, including
  `include/sherpa-onnx/c-api/c-api.h` and its static libraries. Set
  `SHERPA_ONNX_ROOT` to that prefix.

The native sherpa-embed-asr CMake project expects sherpa-onnx C API plus
ONNX Runtime. The CAM++ trunk path is disabled for this first WASM target;
Windows Media Foundation and Windows DPAPI are naturally excluded by the
Emscripten platform. Encryption is not enabled in this target unless a
WASM-compatible crypto backend is explicitly added.

## Build

```bash
# from the app repository root
export GH_TOKEN=... # read-only token, never commit or print it
./scripts/clone-engine.sh
unset GH_TOKEN

# after building/installing sherpa-onnx for Emscripten:
export SHERPA_ONNX_ROOT=/absolute/path/to/sherpa-onnx-wasm-prefix
./scripts/build-wasm.sh
```

Output at this stage: `build-wasm/engine/libsherpa_embed_asr.a`.

## Current boundary

This is the first native-core cross-compilation stage, not yet a runnable
browser recognizer. The final Emscripten executable, exported C ABI/JS bridge,
Web Worker streaming protocol, model packaging and offline cache integration
remain subsequent tasks. In particular, do not treat a successful archive
build as proof of browser inference; the sherpa-onnx dependency must itself be
built for Emscripten and linked into a final module.
