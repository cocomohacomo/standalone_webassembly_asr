# Standalone WebAssembly ASR

A mobile-first, installable PWA prototype for offline-first speech transcription.

## Current prototype

- Mobile-first recorder UI
- Local microphone recording via MediaRecorder
- Playback and audio download
- Editable transcription notes
- Copy and TXT export
- Local history (localStorage)
- PWA manifest, install prompt, and versioned Service Worker app-shell caching
- No audio upload or remote inference

**ASR integration status:** the actual engine source is fetched read-only at a pinned commit into
`vendor/sherpa-embed-asr` (ignored by this repository). The Actions check verifies access and
the exact revision. The application-owned Emscripten static-core build configuration is in
[`wasm/`](wasm/README.md); it adapts a build-directory copy only and never changes the upstream
repository. The browser WASM module, Worker protocol, and model-loading path are now present. The Pages workflow builds the real WASM artifact and validates the published app shell; full browser microphone-to-transcript E2E and offline first-load still require separate verification.

## Private engine checkout

Register a fine-grained, read-only token as the repository Actions secret `GH_TOKEN`.
It needs Contents: Read access to the private `sherpa-embed-asr` repository. The
[`Verify private ASR engine checkout`](.github/workflows/engine-source-check.yml) workflow fetches
and verifies the pinned SHA. See [engine integration](engine/README.md).

## Emscripten core build

See [WASM build prerequisites and current boundary](wasm/README.md). The first cross-build
requires an Emscripten-built sherpa-onnx C API prefix; the engine's CAM++ trunk path is disabled
for this initial target. This archive build alone is not yet browser inference.

## Deploy to GitHub Pages

1. In GitHub, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Push to `main`. `.github/workflows/pages.yml` validates the static app shell, uploads it as a Pages artifact, and deploys it.
4. The workflow deliberately skips `actions/configure-pages` because this is a static site and that action requires a Pages-site configuration API call that is unnecessary for packaging the artifact.

## Install on Android

1. Open the deployed site in Chrome over HTTPS.
2. Use the in-app **アプリをインストール** prompt when Chrome exposes it, or Chrome's menu → **Install app**.
3. Launch from the home screen while online.
4. Start recording once and allow the complete ASR/VAD/CAM++ model preparation to finish. Wait for “全6モデルを端末内に保存しました” and “日本語音声認識・話者識別の準備完了”.
5. Close and relaunch the installed app in airplane mode. The Service Worker supplies the app/WASM runtime and IndexedDB supplies the verified model files.
6. Test recording and transcription in airplane mode.

The app shell and compiled WASM runtime are precached by the Service Worker. On the first online ASR initialization, all six model assets are downloaded, SHA-256 checked when a pinned digest is available, hashed, and persisted in IndexedDB. Later ASR initialization reads and re-hashes the local IndexedDB copies before any network access. Complete the first model preparation while online, wait for the app to report that all models are stored, then relaunch in airplane mode. Microphone recording still requires a secure context and user permission. Browser storage can be evicted by the OS; the app requests persistent storage but the browser may deny it. If storage is cleared, the models must be prepared again online.

## Roadmap

1. Build and pin the sherpa-onnx Emscripten C API dependency.
2. Complete the C ABI-to-WASM exports and browser-safe streaming interface.
3. Persist verified model assets in IndexedDB and precache the WASM runtime for offline startup.
4. Validate recognition correctness, memory, latency, storage eviction recovery, and Android Chrome behavior on real devices.


## License and model notices

The application and ASR engine have separate license scopes. The embedded
`sherpa-embed-asr` engine is MIT-licensed at pinned revision
`75c71c4ee70e05ec8e9b301fd9aaad1934322d23`. Its bundled sherpa-onnx and ONNX
Runtime dependencies retain their own Apache-2.0 / MIT terms and notices.
The copied upstream notices and license texts are in [licenses/](licenses/).
Model artifacts have separate terms documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The Pages artifact publishes these notices under `/licenses/` as well as the
model notice at `/THIRD_PARTY_NOTICES.md`. The application repository's own
`LICENSE` does not replace any third-party license.


## Browser-tab audio transcription

The recorder supports microphone and browser-tab audio through a source-adapter
boundary. Choose **タブ音声** beside the record button, start capture, then
select the browser tab playing the source audio. In Chromium desktop browsers,
enable the tab-audio sharing option in the browser share picker. The app records
only selected audio tracks; the required display video track is never connected
to the ASR pipeline or MediaRecorder.

The browser source feeds the same mono 16 kHz PCM AudioWorklet and WASM Worker
protocol as microphone input. Model loading, recognition, transcript handling,
and local storage remain shared. The adapter contract is independent of the
browser capture API so a future Android native AudioPlaybackCapture adapter
can feed the same PCM pipeline.

Limitations: browser-tab capture depends on browser/OS support and explicit
user permission. The app cannot force a YouTube player or OS mute state. Mute
the device speakers/output rather than muting the source tab itself; muting
the source tab may also mute captured audio. Android Chrome/PWA support is not
assumed and must be verified on-device. Capturing other Android apps requires
a future native implementation and remains subject to Android capture policy
and the source app's capture-allowance.
