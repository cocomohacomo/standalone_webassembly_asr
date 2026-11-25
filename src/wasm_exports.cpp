#include <emscripten.h>
#include <stdint.h>
#include <string>
#include "sherpa_embed_asr/asr_c_api.h"

namespace {
AsrEngine* g_engine = nullptr;
std::string g_last_error;
}

extern "C" {
EMSCRIPTEN_KEEPALIVE
int wasm_asr_create(const char* model_dir, const char* vad_model_path) {
  if (g_engine) {
    asr_engine_destroy(g_engine);
    g_engine = nullptr;
  }
  AsrConfig config;
  asr_config_init_defaults(&config);
  config.model_dir = model_dir;
  config.vad_model_path = vad_model_path;
  config.sample_rate = 16000;
  config.num_threads_asr = 1;
  config.enable_diarization = 0;
  config.polish_level = ASR_POLISH_OFF;
  g_engine = asr_engine_create(&config);
  if (!g_engine || !asr_engine_is_ready(g_engine)) {
    char error[2048] = {};
    if (g_engine) asr_engine_init_warnings(g_engine, error, sizeof(error));
    g_last_error = error[0] ? error : "ASR engine initialization failed";
    if (g_engine) {
      asr_engine_destroy(g_engine);
      g_engine = nullptr;
    }
    return -1;
  }
  g_last_error.clear();
  return 0;
}

EMSCRIPTEN_KEEPALIVE
int wasm_asr_push_pcm(const float* samples, int32_t count) {
  if (!g_engine) return -1;
  const int rc = asr_engine_push_pcm(g_engine, samples, count);
  if (rc != 0) {
    char error[2048] = {};
    asr_engine_last_error(g_engine, error, sizeof(error));
    g_last_error = error;
  }
  return rc;
}

EMSCRIPTEN_KEEPALIVE
int wasm_asr_flush(void) {
  if (!g_engine) return -1;
  const int rc = asr_engine_flush(g_engine);
  if (rc != 0) {
    char error[2048] = {};
    asr_engine_last_error(g_engine, error, sizeof(error));
    g_last_error = error;
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
  return g_last_error.c_str();
}
}
