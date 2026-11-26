# Model assets

The application currently fetches model artifacts at runtime; no model binaries are vendored here yet.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for per-file provenance, upstream license declarations, hashes, and redistribution obligations.

Do not add model binaries until:
1. The exact artifact bytes are verified against the named upstream model/revision.
2. The applicable model license and all attribution/NOTICE files are included.
3. Large files are stored using Git LFS or another suitable artifact mechanism. The current Japanese encoder ONNX is approximately 155 MB and exceeds GitHub's 100 MB regular Git file limit.
