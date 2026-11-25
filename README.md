# Standalone WebAssembly ASR

A mobile-first, installable PWA prototype for offline-first speech transcription.

## Current prototype

- Mobile-first recorder UI
- Local microphone recording via MediaRecorder
- Playback and audio download
- Editable transcription notes
- Copy and TXT export
- Local history (localStorage)
- PWA manifest and Service Worker app-shell caching

**ASR integration status:** the actual `sherpa-embed-asr` WebAssembly runtime and model are not connected yet. This prototype records audio locally and provides a text editor for transcription. No audio is uploaded.

## Deploy to GitHub Pages

1. In GitHub, open **Settings → Pages**.
2. Set **Build and deployment → Source** to **GitHub Actions**.
3. Push to `main`. The workflow publishes the static PWA.

## Install on Android

1. Open the deployed site in Chrome.
2. Use Chrome's menu → **Install app** (or **Add to Home screen**).
3. Launch from the home screen.

The initial visit requires network access to download the app shell. Once cached, the app shell can load offline. Browser storage can still be cleared by the OS.

## Planned next steps

1. Build/export the ASR library to WebAssembly.
2. Load WASM and model assets from a Web Worker.
3. Connect microphone PCM frames to the ASR API.
4. Add offline model download, integrity/version checks, and real-device performance tests.

## Engine

ASR engine source: https://github.com/cocomohacomo/sherpa-embed-asr
