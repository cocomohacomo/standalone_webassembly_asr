# Model assets

The runtime is now local-first: it requests these repository-relative assets and temporarily falls back to the pinned Hugging Face URLs until the LFS objects are committed.

Expected layout:

```
models/
  SHA256SUMS
  ja/
    tokens.txt
    encoder-epoch-99-avg-1.int8.onnx
    decoder-epoch-99-avg-1.onnx
    joiner-epoch-99-avg-1.onnx
  silero_vad.onnx
  3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx
```

ONNX files are configured for Git LFS in the root `.gitattributes`. The Pages workflow checks out LFS objects and only publishes the model directory when `SHA256SUMS` exists; it verifies every listed digest before packaging and again in the Pages artifact.

Do not create `SHA256SUMS` from expected values or LFS pointer text. It must be generated from the downloaded binary files after SHA-256 has been calculated over their actual bytes. Current verified hashes are available only for the Silero VAD and CAM++ files; hashes for the Japanese model files still need to be calculated from the actual binaries.

See [THIRD_PARTY_NOTICES.md](../THIRD_PARTY_NOTICES.md) for model provenance and redistribution terms, and [ASR third-party notices](../licenses/ASR-THIRD_PARTY_NOTICES.md) for the embedded engine.
