# Third-party model notices

This file covers the model artifacts currently referenced by `app.js`. It does not change the license of this application or grant rights beyond the upstream licenses identified below.

## Japanese ASR: ReazonSpeech k2 v2 / Zipformer

Files currently fetched:
- `tokens.txt`
- `encoder-epoch-99-avg-1.int8.onnx`
- `decoder-epoch-99-avg-1.onnx`
- `joiner-epoch-99-avg-1.onnx`

Upstream model: https://huggingface.co/reazon-research/reazonspeech-k2-v2
Model card declares Apache License 2.0. sherpa documentation identifies this Japanese Zipformer model as derived from ReazonSpeech and points to the above upstream model:
https://k2-fsa.github.io/sherpa/onnx/pretrained_models/offline-transducer/zipformer-transducer-models.html

Current app mirror: https://huggingface.co/DeL-TaiseiOzaki/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01
The mirror has no model card or license file. The upstream ReazonSpeech model card declares Apache-2.0, and the mirror's three ONNX file sizes match the corresponding upstream files. Before vendoring, verify the actual bytes against the upstream revision and retain the upstream Apache-2.0 notice.

## Voice activity detection: Silero VAD

File currently fetched: `silero_vad.onnx`
SHA-256: `9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6`

The current distribution page states that this ONNX file is unchanged from the sherpa-onnx `asr-models` release (Apache-2.0) and identifies the underlying Silero VAD project as MIT:
- https://github.com/k2-fsa/sherpa-onnx/releases/tag/asr-models
- https://github.com/snakers4/silero-vad

Preserve both upstream attributions and include the applicable Apache-2.0 and MIT license texts with any redistributed bundle.

## Speaker embedding: CAM++

File currently fetched: `3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx`
SHA-256: `f682b514c05d947ee3fa91cd6ec6c5c7543479a128373fa29b1faedccd21fd11`

The app pins the Hugging Face mirror to immutable revision `8be2a75c9ed7a590538b268e46fbb65e1aa9d208` rather than `main`. The revision's Xet pointer records the same SHA-256 and a file size of 28,281,138 bytes. The app verifies the downloaded bytes before writing the model into the WASM filesystem.

Upstream model: https://www.modelscope.cn/models/iic/speech_campplus_sv_zh-cn_16k-common
The ModelScope model card declares Apache License 2.0. The model is associated with the 3D-Speaker project:
https://github.com/modelscope/3D-Speaker

Preserve the upstream model and project attribution and include the Apache-2.0 license text with any redistributed bundle. The ONNX mirror used by this app does not itself include a model card; verify the mirror artifact against the named upstream model revision before redistribution.

## Redistribution conditions

For Apache-2.0 artifacts, include a copy of the Apache-2.0 license, retain applicable copyright/patent/trademark/attribution notices, preserve any upstream NOTICE content, and mark modified files. For MIT-licensed components, include the copyright and permission notice.

These notices are a provenance record, not a legal opinion. The app currently downloads the files from their upstream/mirror URLs; this document alone does not mean the model binaries are included in this repository.
