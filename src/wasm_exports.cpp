#include <emscripten.h>
#include <stdint.h>
#include <string>
#include <vector>
#include "sherpa_embed_asr/asr_c_api.h"

EM_JS(void, wasm_emit_asr_event,
      (int type, const char* text, const char* speaker, double t0, double t1,
       const char* other, const char* status, const char* assignment,
       const char* name, double confidence, int overlapped, int turn_index,
       int speaker_count), {
  if (Module.onAsrEvent) Module.onAsrEvent({
    type, text: text ? UTF8ToString(text) : "",
    speaker: speaker ? UTF8ToString(speaker) : "", t0, t1,
    otherSpeaker: other ? UTF8ToString(other) : "",
    speakerStatus: status ? UTF8ToString(status) : "",
    speakerAssignment: assignment ? UTF8ToString(assignment) : "",
    speakerName: name ? UTF8ToString(name) : "",
    speakerConfidence: confidence, overlapped: !!overlapped,
    turnIndex: turn_index, speakerCount: speaker_count
  });
});

namespace {
AsrEngine* g_engine = nullptr;
std::string g_last_error, g_options_dump, g_json;
void OnAsrEvent(const AsrEvent* e, void*) {
  if (!e) return;
  wasm_emit_asr_event(static_cast<int>(e->type), e->text, e->spk_id,
    e->t0_sec, e->t1_sec, e->other_spk_id, e->speaker_status,
    e->speaker_assignment, e->speaker_name, e->speaker_confidence,
    e->overlapped, e->turn_index, e->speaker_count);
}
const char* EngineError() { return g_engine ? asr_engine_last_error(g_engine) : nullptr; }
const char* ReadJson(int (*fn)(const AsrEngine*, char*, int32_t)) {
  std::vector<char> b(262144, '\0');
  int n=fn(g_engine,b.data(),static_cast<int32_t>(b.size()));
  if(n<0){const char* e=EngineError();g_last_error=e?e:"speaker API failed";g_json="";return g_json.c_str();}
  g_json.assign(b.data()); return g_json.c_str();
}
}
extern "C" {
EMSCRIPTEN_KEEPALIVE const char* wasm_asr_options_dump(const char* options) {
  AsrConfig c; asr_config_init_defaults(&c);
  std::string o="parallel_workers=1;correction_suggest=0;seibunka=0;continuous_time=0";
  if(options&&*options){o+=";";o+=options;}
  std::vector<char>b(65536,'\0');
  int rc=asr_options_dump(&c,o.c_str(),b.data(),static_cast<int32_t>(b.size()));
  g_options_dump=rc<0?std::string("{\"error\":\"")+b.data()+"\"}":b.data();
  return g_options_dump.c_str();
}
EMSCRIPTEN_KEEPALIVE int wasm_asr_create(const char* model_dir,const char* vad,
 const char* tokens,const char* encoder,const char* decoder,const char* joiner,const char* options) {
 if(g_engine){asr_engine_destroy(g_engine);g_engine=nullptr;}
 AsrConfig c;asr_config_init_defaults(&c);c.model_dir=model_dir;c.vad_model_path=vad;
 c.tokens_path=tokens;c.encoder_path=encoder;c.decoder_path=decoder;c.joiner_path=joiner;
 c.sample_rate=16000;c.num_threads_asr=1;c.enable_diarization=1;c.polish_level=ASR_POLISH_OFF;
 std::string o="parallel_workers=1;correction_suggest=0;seibunka=0;continuous_time=0;diarization_backend=native;voiceprint_policy=strict;voiceprint_pin_identified=1;voiceprint_link_unverified=1;voiceprint_create_store=1";
 if(options&&*options){o+=";";o+=options;}
 g_engine=asr_engine_create_ex(&c,o.c_str());
 if(!g_engine||!asr_engine_is_ready(g_engine)){const char*e=EngineError();g_last_error=e?e:"ASR engine initialization failed";if(g_engine){asr_engine_destroy(g_engine);g_engine=nullptr;}return -1;}
 asr_engine_set_callback(g_engine,OnAsrEvent,nullptr);g_last_error.clear();return 0;
}
EMSCRIPTEN_KEEPALIVE int wasm_asr_push_pcm(const float*s,int32_t n){if(!g_engine)return -1;int r=asr_engine_push_pcm(g_engine,s,n);if(r){const char*e=EngineError();g_last_error=e?e:"push_pcm failed";}return r;}
EMSCRIPTEN_KEEPALIVE int wasm_asr_flush(void){if(!g_engine)return -1;int r=asr_engine_flush(g_engine);if(r){const char*e=EngineError();g_last_error=e?e:"flush failed";}return r;}
EMSCRIPTEN_KEEPALIVE void wasm_asr_destroy(void){if(g_engine){asr_engine_destroy(g_engine);g_engine=nullptr;}}
EMSCRIPTEN_KEEPALIVE const char* wasm_asr_last_error(void){return g_engine?EngineError():g_last_error.c_str();}
EMSCRIPTEN_KEEPALIVE int wasm_asr_diarization_available(void){return asr_diarization_available();}
EMSCRIPTEN_KEEPALIVE int wasm_asr_voiceprint_available(void){return g_engine?asr_engine_voiceprint_available(g_engine):0;}
EMSCRIPTEN_KEEPALIVE const char* wasm_asr_speakers_json(void){return g_engine?ReadJson(asr_engine_speakers_json):"[]";}
EMSCRIPTEN_KEEPALIVE const char* wasm_asr_voiceprint_profiles(void){return g_engine?ReadJson(asr_engine_voiceprint_profiles):"[]";}
EMSCRIPTEN_KEEPALIVE const char* wasm_asr_voiceprint_suggest(int32_t k){
 if(!g_engine)return "[]";std::vector<char>b(65536,'\0');int r=asr_engine_voiceprint_suggest(g_engine,k,b.data(),b.size());
 if(r<0){const char*e=EngineError();g_last_error=e?e:"voiceprint suggest failed";return "[]";}g_json=b.data();return g_json.c_str();
}
EMSCRIPTEN_KEEPALIVE int wasm_asr_enroll_speaker(const float*s,int32_t n,const char*id,const char*name){
 if(!g_engine)return -1;int r=asr_engine_enroll_speaker(g_engine,s,n,id,name);if(r<0){const char*e=EngineError();g_last_error=e?e:"speaker enrollment failed";}return r;
}
EMSCRIPTEN_KEEPALIVE int wasm_asr_rename_speaker(const char*id,const char*name){if(!g_engine)return -1;return asr_engine_rename_speaker(g_engine,id,name);}
EMSCRIPTEN_KEEPALIVE int wasm_asr_delete_voiceprint(const char*id){if(!g_engine)return -1;return asr_engine_voiceprint_delete(g_engine,id);}
EMSCRIPTEN_KEEPALIVE int wasm_asr_label_speaker(double t0,double t1,const char*id,const char*name){if(!g_engine)return -1;return asr_engine_label_speaker(g_engine,t0,t1,id,name);}
EMSCRIPTEN_KEEPALIVE int wasm_asr_reject_speaker(double t0,double t1,const char*id){if(!g_engine)return -1;return asr_engine_reject_speaker(g_engine,t0,t1,id);}
EMSCRIPTEN_KEEPALIVE int wasm_asr_unlabel_speaker(double t0,double t1){if(!g_engine)return -1;return asr_engine_unlabel_speaker(g_engine,t0,t1);}
EMSCRIPTEN_KEEPALIVE int wasm_asr_merge_speakers(const char*a,const char*b){if(!g_engine)return -1;return asr_engine_merge_speakers(g_engine,a,b);}
EMSCRIPTEN_KEEPALIVE int wasm_asr_relabel(void){if(!g_engine)return -1;return asr_engine_relabel(g_engine);}
EMSCRIPTEN_KEEPALIVE int wasm_asr_voiceprint_save(const char*path){if(!g_engine)return -1;return asr_engine_voiceprint_save(g_engine,path);}
}
