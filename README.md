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
3. Launch from the home screen.
4. After the first successful load, open once while online so the Service Worker can cache the app shell; then enable airplane mode and relaunch to test offline startup.

The app shell is cached locally. Microphone recording requires a secure context and user permission. Browser storage may still be cleared by the OS. Offline startup does not mean the ASR engine is available yet.

## Roadmap

1. Build and pin the sherpa-onnx Emscripten C API dependency.
2. Complete the C ABI-to-WASM exports and browser-safe streaming interface.
3. Run the engine in a Web Worker and add offline model caching.
4. Validate recognition correctness, memory, latency, and Android Chrome behavior on real devices.


## License and model notices

The application and ASR engine have separate license scopes. The embedded
`sherpa-embed-asr` engine is MIT-licensed at pinned revision
`60c8e87412e6e14919a0256f5e94951d18a773cd`. Its bundled sherpa-onnx and ONNX
Runtime dependencies retain their own Apache-2.0 / MIT terms and notices.
The copied upstream notices and license texts are in [licenses/](licenses/).
Model artifacts have separate terms documented in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

The Pages artifact publishes these notices under `/licenses/` as well as the
model notice at `/THIRD_PARTY_NOTICES.md`. The application repository's own
`LICENSE` does not replace any third-party license.
