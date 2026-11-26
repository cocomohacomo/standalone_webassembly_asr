#include <emscripten.h>
#include <stdint.h>
#include <string>
#include <vector>

#include "sherpa_embed_asr/asr_c_api.h"

EM_JS(void, wasm_emit_asr_event,
      (int type, const char* text, const char* speaker, double t0, double t1), {
  if (Module.onAsrEvent) {
    Module.onAsrEvent({
      type: type,
      text: text ? UTF8ToString(text) : "",
      speaker: speaker ? UTF8ToString(speaker) : "",
      t0: t0,
      t1: t1
    });
  }
});

namespace {
AsrEngine* g_engine = nullptr;
std::string g_last_error;
std::string g_options_dump;

void OnAsrEvent(const AsrEvent* event, void*) {
  if (!event) return;
  wasm_emit_asr_event(static_cast<int>(event->type), event->text,
                      event->spk_id, event->t0_sec, event->t1_sec);
}

const char* EngineError() {
  return g_engine ? asr_engine_last_error(g_engine) : nullptr;
}
}  // namespace

extern "C" {


EMSCRIPTEN_KEEPALIVE
const char* wasm_asr_options_dump(const char* options) {
  AsrConfig config;
  asr_config_init_defaults(&config);
  std::string effective = "parallel_workers=1;correction_suggest=0;seibunka=0;continuous_time=0;continuous_time=0";
  if (options && *options) { effective += ";"; effective += options; }
  std::vector<char> buffer(65536, '\0');
  const int rc = asr_options_dump(&config, effective.c_str(), buffer.data(),
                                  static_cast<int32_t>(buffer.size()));
  if (rc < 0) {
    g_options_dump = std::string("{\"error\":\"") + buffer.data() + "\"}";
  } else {
    g_options_dump.assign(buffer.data());
  }
  return g_options_dump.c_str();
}


EMSCRIPTEN_KEEPALIVE
int wasm_asr_create(const char* model_dir, const char* vad_model_path,
                    const char* tokens_path, const char* encoder_path,
                    const char* decoder_path, const char* joiner_path, const char* options) {
  if (g_engine) {
    asr_engine_destroy(g_engine);
    g_engine = nullptr;
  }

  AsrConfig config;
  asr_config_init_defaults(&config);
  config.model_dir = model_dir;
  config.vad_model_path = vad_model_path;
  config.tokens_path = tokens_path;
  config.encoder_path = encoder_path;
  config.decoder_path = decoder_path;
  config.joiner_path = joiner_path;
  config.sample_rate = 16000;
  config.num_threads_asr = 1;
  config.enable_diarization = 0;
  config.polish_level = ASR_POLISH_OFF;

  // Emscripten build is deliberately single-threaded: avoid the engine's
  // optional decode pool, correction and normalization background workers.
  std::string effective = "parallel_workers=1;correction_suggest=0;seibunka=0;continuous_time=0";
  if (options && *options) { effective += ";"; effective += options; }
  g_engine = asr_engine_create_ex(&config, effective.c_str());
  if (!g_engine || !asr_engine_is_ready(g_engine)) {
    const char* error = EngineError();
    g_last_error = error ? error : "ASR engine initialization failed";
    if (g_engine) {
      asr_engine_destroy(g_engine);
      g_engine = nullptr;
    }
    return -1;
  }

  asr_engine_set_callback(g_engine, OnAsrEvent, nullptr);
  g_last_error.clear();
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int wasm_asr_push_pcm(const float* samples, int32_t count) {
  if (!g_engine) return -1;
  const int rc = asr_engine_push_pcm(g_engine, samples, count);
  if (rc != 0) {
    const char* error = EngineError();
    g_last_error = error ? error : "asr_engine_push_pcm failed";
  }
  return rc;
}

EMSCRIPTEN_KEEPALIVE
int wasm_asr_flush(void) {
  if (!g_engine) return -1;
  const int rc = asr_engine_flush(g_engine);
  if (rc != 0) {
    const char* error = EngineError();
    g_last_error = error ? error : "asr_engine_flush failed";
  }
  return rc;
}

EMSCRIPTEN_KEEPALIVE
void wasm_asr_destroy(void) {
  if (g_engine) {
    asr_engine_destroy(g_engine);
    g_engine = nullptr;
  }
}

EMSCRIPTEN_KEEPALIVE
const char* wasm_asr_last_error(void) {
  return g_engine ? EngineError() : g_last_error.c_str();
}

}  // extern "C"
