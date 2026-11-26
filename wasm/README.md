# Emscripten build

The build compiles the pinned sherpa-onnx C API and its ONNX Runtime WebAssembly
static dependency set, then links the private sherpa-embed-asr core into one
browser module.

## Build

```bash
./scripts/clone-engine.sh
./scripts/build-sherpa-onnx-wasm.sh
SHERPA_ONNX_ROOT="$PWD/.cache/sherpa-onnx-wasm" ./scripts/build-wasm.sh
```

sherpa-onnx is pinned to
`17d5f144035fb35e13b787445fd3a0100998aa5a`. Its upstream CMake selects the
ONNX Runtime WASM SIMD static package v1.28.2 and verifies its SHA-256
(`88688849b67fed9ca0e9fb2bf92ce19a5def9e8c2c8c2df34eb235d25893232a`).
The demo ASR target is disabled; the reusable C API archive and static
dependencies are installed under `.cache/sherpa-onnx-wasm`.

The private engine source is copied into the build tree and its native shared
target is adapted to a static target there. The upstream private repository
is never modified. The final target links the engine archive and every
installed sherpa-onnx/ONNX Runtime static archive. Missing C API libraries
now fail CMake configuration instead of silently producing an ASR-less build.

## Browser Worker protocol

`web/wasm/asr-worker.js` owns the module, model filesystem and ASR engine.

- `init`: pass `wasmJsUrl`, `wasmBaseUrl`, `modelRoot`, `modelFiles`
  (each `{ url, path }`) and `vadModelPath`. Model files are fetched in the
  Worker and written into Emscripten's virtual filesystem.
- `audio`: transfer mono 16 kHz Float32 PCM samples normalized to [-1, 1].
- `flush`: finish the current stream.
- `close`: release the engine.
- `asr-event`: emitted with event type, text, speaker and timestamps from the
  native C API callback.

The initial WASM profile uses one ASR thread and disables diarization. This
avoids assuming SharedArrayBuffer/COOP/COEP support on static GitHub Pages.

## Validation status

The Emscripten build and Pages artifact validation passed in workflow run
`45905171386` (engine revision at that time: `60c8e87412e6e14919a0256f5e94951d18a773cd`). The app now pins the license-audited engine revision
`60c8e87412e6e14919a0256f5e94951d18a773cd`; its corresponding rebuild is pending.
A Japanese model/audio fixture E2E test, browser microphone-to-transcript test,
and offline first-load test remain required before claiming recognition works
end-to-end. Do not substitute mock output for real model inference.
