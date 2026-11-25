// Dedicated Worker owns the WASM runtime, model filesystem and ASR engine.
// The UI transfers mono 16 kHz Float32 PCM chunks; no PCM copy crosses the heap.
let runtime = null;
let engineReady = false;

async function installModelFiles(files, modelRoot) {
  const root = modelRoot || "/models/ja";
  runtime.FS.mkdirTree(root);
  for (const item of (files || [])) {
    if (!item || typeof item.url !== "string" || typeof item.path !== "string") {
      throw new Error("Invalid model file descriptor");
    }
    const relative = item.path.replace(/^\/+/, "");
    if (relative.split("/").some((part) => part === "..")) {
      throw new Error("Model path traversal rejected");
    }
    const target = root + "/" + relative;
    const slash = target.lastIndexOf("/");
    if (slash > 0) runtime.FS.mkdirTree(target.slice(0, slash));
    const response = await fetch(item.url);
    if (!response.ok) throw new Error("Model fetch failed (" + response.status + "): " + item.url);
    runtime.FS.writeFile(target, new Uint8Array(await response.arrayBuffer()));
    self.postMessage({ type: "model-file-ready", path: target });
  }
  return root;
}

self.onmessage = async ({ data }) => {
  try {
    switch (data.type) {
      case "init": {
        importScripts(data.wasmJsUrl);
        runtime = await self.createSherpaEmbedAsr({
          locateFile: (name) => new URL(name, data.wasmBaseUrl).toString(),
          print: (message) => self.postMessage({ type: "log", message }),
          printErr: (message) => self.postMessage({ type: "log", message }),
          onAsrEvent: (event) => self.postMessage({ type: "asr-event", event })
        });
        const modelDir = await installModelFiles(data.modelFiles, data.modelRoot);
        const vadPath = data.vadModelPath
          ? (data.vadModelPath.startsWith("/") ? data.vadModelPath : modelDir + "/" + data.vadModelPath)
          : "";
        const modelPtr = runtime.stringToNewUTF8(modelDir);
        const vadPtr = runtime.stringToNewUTF8(vadPath);
        const rc = runtime._wasm_asr_create(modelPtr, vadPtr);
        runtime._free(modelPtr);
        runtime._free(vadPtr);
        if (rc !== 0) throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        engineReady = true;
        self.postMessage({ type: "ready", modelRoot: modelDir });
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
