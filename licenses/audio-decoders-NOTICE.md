# Audio decoders (vendored, unmodified)

Single-file decoders compiled into the library by `src/audio_decode.cpp`
(`asr_audio_decode_file`, docs/LIBRARY.md). No LGPL / GPL code: they replace
libsndfile and FFmpeg for file input.

| File | Upstream | Version | License |
|---|---|---|---|
| `dr_wav.h` | github.com/mackron/dr_libs tag `wav-0.14.6` | 0.14.6 | public domain (Unlicense) or MIT-0 |
| `dr_flac.h` | github.com/mackron/dr_libs tag `flac-0.13.4` | 0.13.4 | public domain (Unlicense) or MIT-0 |
| `dr_mp3.h` | github.com/mackron/dr_libs tag `mp3-0.7.4` | 0.7.4 | public domain (Unlicense) or MIT-0 |
| `stb_vorbis.c` | github.com/nothings/stb commit `5736b15f7ea0ffb08dd38af21067c314d6a3aae9` | 1.22 | public domain or MIT |

The license texts are at the end of each file. M4A / AAC / WMA are decoded by the
operating system (Windows Media Foundation); nothing is vendored for them.
    sha256 fad60f1e360d6de726efc1b9a7985610c89c551719e3f110e8b992f0e1f308cd  dr_wav.h
    sha256 b8078eeb5d523502eb7964508cd7ec8450bc79d383bec90aa17fd9e2fefd9c24  dr_flac.h
    sha256 f5c8020eeebb79877184432efdd2651f24869f5bb8f379d45450fd0aed1ee915  dr_mp3.h
    sha256 4c7cb2ff1f7011e9d67950446b7eb9ca044f2e464d76bfbb0b84dd2e23e65636  stb_vorbis.c
