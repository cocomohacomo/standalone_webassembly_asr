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

# Build from an application-owned copy. Never patch the private upstream checkout.
set(_engine_build_src "${CMAKE_BINARY_DIR}/engine-src")
file(REMOVE_RECURSE "${_engine_build_src}")
file(COPY "${ENGINE_SOURCE_DIR}/" DESTINATION "${_engine_build_src}"
     PATTERN ".git" EXCLUDE PATTERN "build*" EXCLUDE PATTERN ".cache" EXCLUDE)

# Upstream's native target is SHARED and its ELF version-script flags are not
# applicable to Emscripten. Convert only this build copy to a static archive.
file(READ "${_engine_build_src}/CMakeLists.txt" _engine_cmake)
string(REPLACE
  "add_library(sherpa_embed_asr SHARED $<TARGET_OBJECTS:sherpa_embed_asr_core>)"
  "add_library(sherpa_embed_asr STATIC $<TARGET_OBJECTS:sherpa_embed_asr_core>)"
  _engine_cmake "${_engine_cmake}")
string(REPLACE "if(UNIX AND NOT APPLE)" "if(UNIX AND NOT APPLE AND NOT EMSCRIPTEN)"
  _engine_cmake "${_engine_cmake}")
if(NOT _engine_cmake MATCHES "add_library\\(sherpa_embed_asr STATIC")
  message(FATAL_ERROR "Could not apply the expected static-library adaptation; upstream CMake has changed")
endif()
file(WRITE "${_engine_build_src}/CMakeLists.txt" "${_engine_cmake}")

set(SHERPA_EMBED_ASR_BUILD_APPS OFF CACHE BOOL "" FORCE)
set(SHERPA_EMBED_ASR_FETCH_SHERPA OFF CACHE BOOL "" FORCE)
set(SHERPA_EMBED_ASR_WITH_TRUNK OFF CACHE BOOL "" FORCE)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)

add_subdirectory("${_engine_build_src}" engine)

# This stage deliberately produces a static C++ archive. Browser glue, worker
# ABI and final .wasm linking are separate app-owned targets, added after the
# sherpa-onnx Emscripten C API prefix is validated.
