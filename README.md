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

**ASR integration status:** the actual engine source is now managed as a pinned, local checkout in `vendor/sherpa-embed-asr`. The upstream repository is fetched read-only at a fixed commit; this project does not change the ASR repository. See [engine integration](engine/README.md). The browser/WASM adapter and model are not yet built, so real speech recognition is not connected yet.

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

1. Fetch the pinned engine source with [the clone script](engine/README.md).
2. Inspect the native build graph and isolate the minimum inference dependency set.
3. Implement an application-owned Emscripten/WASM build and browser-safe streaming ABI.
4. Load WASM and model assets from a Web Worker and add offline model caching.
5. Validate correctness, memory, latency, and Android Chrome behavior on real devices.
