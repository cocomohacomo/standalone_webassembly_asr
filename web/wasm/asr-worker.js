// Dedicated Worker owns the WASM runtime, model filesystem and ASR engine.
let runtime = null;
let engineReady = false;

async function fetchModel(url) {
  const request = new Request(url, { mode: "cors" });
  // Model caching is an optimization, never a prerequisite for recognition.
  // Mobile browsers may reject a 155 MB cache write due to quota pressure.
  let cache = null;
  if ("caches" in self) {
    try {
      cache = await caches.open("voice-memo-ja-model-v2");
      const cached = await cache.match(request);
      if (cached) return cached;
    } catch (error) {
      console.warn("Model cache unavailable; fetching without cache:", error);
      cache = null;
    }
  }
  let response;
  try { response = await fetch(request); }
  catch (error) { throw new Error("Model network request failed: " + url + " (" + String(error?.message || error) + ")"); }
  if (!response.ok) throw new Error("Model fetch failed (" + response.status + "): " + url);
  if (cache && (response.type === "cors" || response.type === "basic")) {
    try { await cache.put(request, response.clone()); }
    catch (error) { console.warn("Model cache write skipped:", error); }
  }
  return response;
}

async function installModelFiles(files, modelRoot) {
  const root = modelRoot || "/models";
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
    const response = await fetchModel(item.url);
    if (!response.ok) throw new Error("Model fetch failed (" + response.status + "): " + item.url);
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (item.sha256) {
      if (!self.crypto?.subtle) throw new Error("SHA-256 verification is unavailable for " + item.url);
      const digest = await self.crypto.subtle.digest("SHA-256", bytes);
      const actual = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, "0")).join("");
      if (actual !== item.sha256.toLowerCase()) {
        throw new Error("Model SHA-256 mismatch: " + item.url + " (expected " + item.sha256 + ", got " + actual + ")");
      }
    }
    runtime.FS.writeFile(target, bytes);
    self.postMessage({ type: "model-file-ready", path: target });
  }
  return root;
}

self.onmessage = async ({ data }) => {
  try {
    switch (data.type) {
      case "init": {
        importScripts(data.wasmJsUrl);
        // Fetch the binary explicitly in the worker. This makes URL/CORS/cache failures
        // actionable and avoids opaque Emscripten streaming-fetch errors.
        const wasmUrl = new URL("sherpa_embed_asr_wasm.wasm", data.wasmBaseUrl).toString();
        let wasmResponse;
        try { wasmResponse = await fetch(wasmUrl, { mode: "same-origin" }); }
        catch (error) { throw new Error("WASM network request failed: " + wasmUrl + " (" + String(error?.message || error) + ")"); }
        if (!wasmResponse.ok) throw new Error("WASM fetch failed (" + wasmResponse.status + "): " + wasmUrl);
        const wasmBinary = await wasmResponse.arrayBuffer();
        runtime = await self.createSherpaEmbedAsr({
          wasmBinary,
          locateFile: (name) => new URL(name, data.wasmBaseUrl).toString(),
          print: (message) => self.postMessage({ type: "log", message }),
          printErr: (message) => self.postMessage({ type: "log", message }),
          onAsrEvent: (event) => self.postMessage({ type: "asr-event", event })
        });
        const modelRoot = await installModelFiles(data.modelFiles, data.modelRoot);
        const modelDir = modelRoot + "/" + (data.modelSubdir || "ja");
        runtime.FS.mkdirTree(modelDir);
        const paths = data.modelPaths || {};
        const resolve = (path) => path.startsWith("/") ? path : modelDir + "/" + path;
        const args = [
          modelDir,
          resolve(data.vadModelPath || "silero_vad.int8.onnx"),
          resolve(paths.tokens || "tokens.txt"),
          resolve(paths.encoder || "encoder-epoch-99-avg-1.int8.onnx"),
          resolve(paths.decoder || "decoder-epoch-99-avg-1.onnx"),
          resolve(paths.joiner || "joiner-epoch-99-avg-1.onnx"),
          data.options || ""
        ];
        const ptrs = args.map((value) => runtime.stringToNewUTF8(value));
        const rc = runtime._wasm_asr_create(...ptrs);
        ptrs.forEach((ptr) => runtime._free(ptr));
        if (rc !== 0) throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        engineReady = true;
        self.postMessage({ type: "ready", modelDir });
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
