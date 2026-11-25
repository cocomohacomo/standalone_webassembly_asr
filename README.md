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

**ASR integration status:** the actual `sherpa-embed-asr` WebAssembly runtime and model are not connected yet. The current app records audio locally and provides a text editor for transcription. The native engine repository currently has a C/C++ and CPU ONNX Runtime build path; a browser-targeted Emscripten/ONNX Runtime Web build and stable browser ABI still need to be added and tested before genuine on-device recognition can be connected. This repository does not ship a fake recognition fallback.

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

## Engine integration status

The separate `sherpa-embed-asr` repository is the intended sole ASR engine. Its current tree does not contain an Emscripten, WebAssembly, or browser build target. The next engine work is to establish a supported WASM build of the required C API and ONNX Runtime Web backend, define a bounded-memory streaming interface, and validate it in Android Chrome before adding model assets to this PWA.

## Roadmap

1. Add and test an Emscripten/WebAssembly target in the engine repository.
2. Expose a browser-safe streaming C ABI and compile the model/runtime for Web.
3. Load WASM and model assets from a Web Worker; keep inference on-device.
4. Convert microphone audio to the engine's required PCM format and stream frames to the worker.
5. Add offline model download, integrity/version checks, and real-device performance tests.
