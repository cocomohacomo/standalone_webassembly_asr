# Embedded C++ ASR engine

This application consumes the C++ engine as a **local, pinned source checkout** under `vendor/sherpa-embed-asr`. The upstream `cocomohacomo/sherpa-embed-asr` repository is not modified by this project.

## Fetch the engine

The engine repository is private. Create a fine-grained GitHub token with **Contents: Read-only** access to `cocomohacomo/sherpa-embed-asr`, then run:

```bash
GH_TOKEN=... ./scripts/clone-engine.sh
```

The script fetches the immutable revision recorded in `scripts/clone-engine.sh`, checks out detached HEAD, verifies the exact SHA, and refuses to overwrite an existing checkout. The token is passed to Git through a transient HTTP authorization header and is not written to the repository or Git config.

The checkout is intentionally ignored by Git. This avoids copying or rewriting upstream history and keeps application-specific browser/WASM integration in this repository.

## Current integration boundary

The existing engine is a native C/C++ CPU implementation. Fetching its source does **not** make it browser-compatible. The WebAssembly port must be implemented here as an application-owned build layer and adapter. Do not patch upstream sources in place; use wrapper sources, build scripts, and documented patch files under this repository if an unavoidable compatibility shim is needed.

The Pages PWA remains a static shell until a validated browser WASM artifact and model are produced. No mock recognizer is substituted for real inference.
