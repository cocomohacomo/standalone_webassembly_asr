// Dedicated Worker owns the WASM runtime and ASR engine. Audio is transferred
// as Float32Array chunks; the UI thread never touches the WASM heap.
let runtime = null;
let engineReady = false;

self.onmessage = async ({ data }) => {
  try {
    switch (data.type) {
      case "init": {
        importScripts(data.wasmJsUrl);
        runtime = await self.createSherpaEmbedAsr({
          locateFile: (name) => new URL(name, data.wasmBaseUrl).toString(),
          print: (message) => self.postMessage({ type: "log", message }),
          printErr: (message) => self.postMessage({ type: "error", message })
        });
        const modelDir = data.modelDir;
        const vadPath = data.vadModelPath;
        const modelPtr = runtime.stringToNewUTF8(modelDir);
        const vadPtr = runtime.stringToNewUTF8(vadPath);
        const rc = runtime._wasm_asr_create(modelPtr, vadPtr);
        runtime._free(modelPtr);
        runtime._free(vadPtr);
        if (rc !== 0) throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        engineReady = true;
        self.postMessage({ type: "ready" });
        break;
      }
      case "audio": {
        if (!engineReady) throw new Error("ASR engine is not initialized");
        const samples = data.samples instanceof Float32Array
          ? data.samples : new Float32Array(data.samples);
        const ptr = runtime._malloc(samples.byteLength);
        runtime.HEAPF32.set(samples, ptr >>> 2);
        const rc = runtime._wasm_asr_push_pcm(ptr, samples.length);
        runtime._free(ptr);
        if (rc !== 0) throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        self.postMessage({ type: "accepted", sampleCount: samples.length });
        break;
      }
      case "flush": {
        if (!engineReady) throw new Error("ASR engine is not initialized");
        const rc = runtime._wasm_asr_flush();
        if (rc !== 0) throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        self.postMessage({ type: "flushed" });
        break;
      }
      case "close": {
        if (engineReady) runtime._wasm_asr_destroy();
        engineReady = false;
        self.postMessage({ type: "closed" });
        break;
      }
    }
  } catch (error) {
    self.postMessage({ type: "error", message: String(error?.message || error) });
  }
};
