# Third-party notices

sherpa-embed-asr itself (the library, the Python package, the C# wrapper, the
benchmark app and the scripts) is released under the **MIT License**
(`LICENSE`, also `licenses/sherpa-embed-asr.LICENSE.txt`).

What every package flavor (`lib` / `python` / `bench`) redistributes, and under which terms:

## Code and runtimes

| Component | Where | License | Text |
|---|---|---|---|
| sherpa-onnx C API runtime (k2-fsa) | `lib/` / `bin/` | Apache-2.0 | `sherpa-onnx.LICENSE.txt` |
| ONNX Runtime (Microsoft) | `lib/` / `bin/` | MIT (+ its third-party notices) | `onnxruntime.LICENSE.txt`, `onnxruntime.ThirdPartyNotices.txt` |
| oed identification / store code (onnx-embed-diarization, vendored in `third_party/oed`) | compiled into the library | MIT | `oed.LICENSE.txt` |
| OpenSSL 3 libcrypto | **not shipped** (Linux system library; Windows uses CNG / DPAPI) | Apache-2.0 | — |
| Windows Media Foundation (M4A / AAC / WMA input) | **not shipped** (part of Windows) | — | — |
| CPython (bench flavor) | `runtime/` | PSF License | `CPython_LICENSE.txt` (copied by the pack script) |
| dr_wav / dr_flac / dr_mp3 (dr_libs), stb_vorbis (vendored in `third_party/audio_decoders`) | compiled into the library | public domain (Unlicense) or MIT-0 / public domain or MIT | at the end of each file; `third_party/audio_decoders/README.md` |
| numpy, sounddevice (+ PortAudio) (bench flavor) | `runtime/` site-packages | BSD-3 / MIT (MIT) | each package's `*.dist-info/` (shipped with it) |

## Models and data

| Asset | License | Text |
|---|---|---|
| ReazonSpeech Zipformer `sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01` | Apache-2.0 | `Apache-2.0.txt` |
| 3D-Speaker CAM++ `3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx` | Apache-2.0 | `3dspeaker.NOTICE.txt`, `Apache-2.0.txt` |
| Silero VAD `silero_vad.int8.onnx` | MIT | `silero_vad.LICENSE.txt` |
| pyannote segmentation-3.0 (sherpa-onnx export) | MIT (© CNRS) | `pyannote_segmentation3.LICENSE.txt` |
| `configs/punct_ja_cv.tsv` | CC0-1.0 | `punct_ja_cv.NOTICE.txt` |
| `configs/punct_ja_conv.bin`, `punct_ja_gru.bin` | CC BY-SA 4.0 | `punct_ja_conv.NOTICE.txt`, `seibunka_ngram.NOTICE.txt` |
| `configs/seibunka_ngram.bin`, `seibunka_keep.tsv`, `seibunka_ranker.bin` | CC BY-SA 4.0 | `seibunka_ngram.NOTICE.txt` |
| `models/seibunka/kana_kanji.tsv` (from the Mozc OSS dictionary) | Mozc dictionary terms | `mozc_dictionary_oss.NOTICE.txt` (copied by the pack script from `models/seibunka/NOTICE`) |

## Not redistributed

- Evaluation audio and corpora (`.cache/`, `testdata/` other than the repository's own fixtures).
- No API keys, tokens or telemetry: the benchmark app's browser UI is local-only (`127.0.0.1`).
