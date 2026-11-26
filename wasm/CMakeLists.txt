cmake_minimum_required(VERSION 3.22)
project(standalone_webassembly_asr_wasm LANGUAGES C CXX)

if(NOT EMSCRIPTEN)
  message(FATAL_ERROR "Configure with the Emscripten toolchain (emcmake cmake ...)")
endif()
if(NOT DEFINED ENGINE_SOURCE_DIR OR NOT EXISTS "${ENGINE_SOURCE_DIR}/CMakeLists.txt")
  message(FATAL_ERROR "Set ENGINE_SOURCE_DIR to the pinned vendor/sherpa-embed-asr checkout")
endif()
if(NOT DEFINED SHERPA_ONNX_ROOT OR NOT EXISTS "${SHERPA_ONNX_ROOT}/include/sherpa-onnx/c-api/c-api.h")
  message(FATAL_ERROR "Set SHERPA_ONNX_ROOT to an Emscripten-built sherpa-onnx C API prefix")
endif()
# Emscripten's CMake toolchain may restrict find_library() suffixes to
# target-specific shared-library suffixes. These archives are produced by
# sherpa-onnx's install step, so validate and link the exact archive path.
set(SHERPA_ONNX_C_API_LIB "${SHERPA_ONNX_ROOT}/lib/libsherpa-onnx-c-api.a")
if(NOT EXISTS "${SHERPA_ONNX_C_API_LIB}")
  message(FATAL_ERROR "Missing Emscripten static library: ${SHERPA_ONNX_C_API_LIB}")
endif()
file(GLOB SHERPA_ONNX_STATIC_LIBS CONFIGURE_DEPENDS "${SHERPA_ONNX_ROOT}/lib/lib*.a")
if(NOT SHERPA_ONNX_STATIC_LIBS)
  message(FATAL_ERROR "No sherpa-onnx/ONNX Runtime static archives found in ${SHERPA_ONNX_ROOT}/lib")
endif()

# Copy and adapt the private engine in the build directory only.
set(_engine_build_src "${CMAKE_BINARY_DIR}/engine-src")
file(REMOVE_RECURSE "${_engine_build_src}")
file(COPY "${ENGINE_SOURCE_DIR}/" DESTINATION "${_engine_build_src}"
     PATTERN ".git" EXCLUDE PATTERN "build*" EXCLUDE PATTERN ".cache" EXCLUDE)
file(READ "${_engine_build_src}/CMakeLists.txt" _engine_cmake)
string(REPLACE
  "add_library(sherpa_embed_asr SHARED $<TARGET_OBJECTS:sherpa_embed_asr_core>)"
  "add_library(sherpa_embed_asr STATIC $<TARGET_OBJECTS:sherpa_embed_asr_core>)"
  _engine_cmake "${_engine_cmake}")
string(REPLACE "if(UNIX AND NOT APPLE)" "if(UNIX AND NOT APPLE AND NOT EMSCRIPTEN)"
  _engine_cmake "${_engine_cmake}")
string(REPLACE "if(NOT WIN32)" "if(NOT WIN32 AND NOT EMSCRIPTEN)"
  _engine_cmake "${_engine_cmake}")
if(NOT _engine_cmake MATCHES "add_library\\(sherpa_embed_asr STATIC")
  message(FATAL_ERROR "Could not apply expected static-library adaptation; upstream CMake changed")
endif()
file(WRITE "${_engine_build_src}/CMakeLists.txt" "${_engine_cmake}")

set(SHERPA_EMBED_ASR_BUILD_APPS OFF CACHE BOOL "" FORCE)
set(SHERPA_EMBED_ASR_FETCH_SHERPA OFF CACHE BOOL "" FORCE)
set(SHERPA_EMBED_ASR_WITH_TRUNK OFF CACHE BOOL "" FORCE)
set(SHERPA_ONNX_ROOT "${SHERPA_ONNX_ROOT}" CACHE PATH "" FORCE)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
add_subdirectory("${_engine_build_src}" engine)

add_executable(sherpa_embed_asr_wasm "${CMAKE_CURRENT_LIST_DIR}/../src/wasm_exports.cpp")
target_link_libraries(sherpa_embed_asr_wasm PRIVATE sherpa_embed_asr "-Wl,--start-group" ${SHERPA_ONNX_STATIC_LIBS} "-Wl,--end-group")
target_include_directories(sherpa_embed_asr_wasm PRIVATE
  "${ENGINE_SOURCE_DIR}/include" "${SHERPA_ONNX_ROOT}/include")
target_compile_options(sherpa_embed_asr_wasm PRIVATE -O3 -fexceptions)
target_link_options(sherpa_embed_asr_wasm PRIVATE
  "-sALLOW_MEMORY_GROWTH=1"
  "-sINITIAL_MEMORY=268435456"
  "-sSTACK_SIZE=8388608"
  "-sFORCE_FILESYSTEM=1"
  "-sENVIRONMENT=web,worker,node"
  "-sMODULARIZE=1"
  "-sEXPORT_NAME=createSherpaEmbedAsr"
  "-sEXPORTED_FUNCTIONS=['_malloc','_free','_wasm_asr_options_dump','_wasm_asr_create','_wasm_asr_push_pcm','_wasm_asr_flush','_wasm_asr_destroy','_wasm_asr_last_error','_wasm_asr_diarization_available','_wasm_asr_voiceprint_available','_wasm_asr_speakers_json','_wasm_asr_voiceprint_profiles','_wasm_asr_voiceprint_suggest','_wasm_asr_enroll_speaker','_wasm_asr_rename_speaker','_wasm_asr_delete_voiceprint','_wasm_asr_label_speaker','_wasm_asr_reject_speaker','_wasm_asr_unlabel_speaker','_wasm_asr_merge_speakers','_wasm_asr_relabel','_wasm_asr_voiceprint_save']"
  "-sEXPORTED_RUNTIME_METHODS=['UTF8ToString','stringToNewUTF8','FS','HEAPF32']")
set_target_properties(sherpa_embed_asr_wasm PROPERTIES SUFFIX ".js")
