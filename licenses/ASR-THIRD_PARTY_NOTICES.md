# Third-party notices

sherpa-embed-asr itself (the library, the Python package, the C# wrapper, the
benchmark app and the scripts) is released under the **MIT License**
(`LICENSE`, also `licenses/sherpa-embed-asr.LICENSE.txt`).

Default `lib` / `python` / `bench` packages use the permissive asset profile: built-in rule punctuation is used; CC0 punctuation data is not included; CC BY-SA punctuation weights and IPAdic/Mozc-derived normalization data are not included. The source repository retains those optional assets and their notices for users who separately obtain and enable them.

## Code and runtimes

| Component | Where | License | Text |
|---|---|---|---|
| sherpa-onnx C API runtime (k2-fsa) | `lib/` / `bin/` | Apache-2.0 | `sherpa-onnx.LICENSE.txt` |
| ONNX Runtime (Microsoft) | `lib/` / `bin/` | MIT (+ its third-party notices) | `onnxruntime.LICENSE.txt`, `onnxruntime.ThirdPartyNotices.txt` |
| oed identification / store code (onnx-embed-diarization, vendored in `third_party/oed`) | compiled into the library | MIT | `oed.LICENSE.txt` |
| kaldi-native-fbank v1.23.0 (optional CAM++ trunk feature; fetched by CMake and statically linked) | compiled into the library when `SHERPA_EMBED_ASR_WITH_TRUNK=ON` | Apache-2.0 | `kaldi-native-fbank.LICENSE.txt` |
| OpenSSL 3 libcrypto | **not shipped** (Linux system library; Windows uses CNG / DPAPI) | Apache-2.0 | — |
| Windows Media Foundation (M4A / AAC / WMA input) | **not shipped** (part of Windows) | — | — |
| CPython (bench flavor) | `runtime/` | PSF License | `CPython_LICENSE.txt` (copied by the pack script) |
| dr_wav / dr_flac / dr_mp3 (dr_libs), stb_vorbis (vendored in `third_party/audio_decoders`) | compiled into the library | public domain (Unlicense) or MIT-0 / public domain or MIT | `audio-decoders.NOTICE.txt`; source revisions and hashes: `third_party/audio_decoders/README.md` |
| benchmark UI adapted from `cocomohacomo/whisper-diarization-suite` | `benchmark/` (bench flavor) | MIT | `whisper-diarization-suite.NOTICE.txt` |
| numpy, sounddevice (+ PortAudio) (bench flavor) | `runtime/` site-packages | BSD-3 / MIT (MIT) | each package's `*.dist-info/` (shipped with it) |

## Models and data

Details, sources and what to keep when redistributing: `docs/MODEL_LICENSES.md`.

| Asset | Source | License | Text |
|---|---|---|---|
| ReazonSpeech Zipformer `sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01` | reazon-research/reazonspeech-k2-v2, ONNX by k2-fsa | Apache-2.0 | `Apache-2.0.txt` |
| Silero VAD v4 `silero_vad.int8.onnx` | snakers4/silero-vad, ONNX + INT8 by k2-fsa | MIT (© Silero Team) | `silero_vad.LICENSE.txt` |
| pyannote segmentation-3.0 (sherpa-onnx export) | pyannote/segmentation-3.0 | MIT (© CNRS) | `pyannote_segmentation3.LICENSE.txt` |
| 3D-Speaker CAM++ (`campplus_split/campplus_{trunk,head}.onnx`, split by this project; or the unsplit `3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx`) | iic/speech_campplus_sv_zh-cn_16k-common, ONNX by k2-fsa | Apache-2.0 | `3dspeaker.NOTICE.txt`, `Apache-2.0.txt` |
| 3D-Speaker ERes2NetV2 (optional, not shipped) | iic/speech_eres2netv2_sv_zh-cn_16k-common | Apache-2.0 | `3dspeaker.NOTICE.txt`, `Apache-2.0.txt` |
| `configs/punct_ja_cv.tsv` (source-only optional; not included in default packages) | Common Voice 8.0 ja sentences | CC0-1.0 | `punct_ja_cv.NOTICE.txt` |
| `configs/punct_ja_conv.bin`, `punct_ja_gru.bin` (source-only optional assets; not in default packages) | trained here on nu-dialogue corpora + ja Wikipedia | CC BY-SA 4.0 | `punct_ja_conv.NOTICE.txt`, `seibunka_ngram.NOTICE.txt` |
| `configs/seibunka_ngram.bin`, `seibunka_keep.tsv`, `seibunka_ranker.bin` (source-only optional assets; not in default packages) | trained here on the same text | CC BY-SA 4.0 | `seibunka_ngram.NOTICE.txt` |
| `models/seibunka/kana_kanji.tsv` | Mozc OSS dictionary (IPAdic 2.7.0 + Okinawa dictionary) | IPAdic license (NAIST) + public domain | `mozc_dictionary_oss.NOTICE.txt` (copied by the pack script from `models/seibunka/NOTICE`) |

## Not redistributed by the default package profile

- CC BY-SA 4.0 punctuation weights and seibunka n-gram/ranker assets.
- IPAdic/Mozc-derived kana-to-kanji dictionary.

## Not redistributed

- Research-only models under `models/` (Whisper, SenseVoice, DPDFNet / GTCRN): not loaded by the library, not packed.
- Evaluation audio and corpora (`.cache/`, `testdata/` other than the repository's own fixtures).
- No API keys, tokens or telemetry: the benchmark app's browser UI is local-only (`127.0.0.1`).
