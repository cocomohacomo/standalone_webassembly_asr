// Dedicated Worker owns the WASM runtime, model filesystem and ASR engine.
let runtime = null;
let engineReady = false;
const VOICEPRINT_DB = "vnn-voiceprints", VOICEPRINT_STORE = "profiles";
function openVoiceprintDb(){return new Promise((resolve,reject)=>{const q=indexedDB.open(VOICEPRINT_DB,1);q.onupgradeneeded=()=>q.result.createObjectStore(VOICEPRINT_STORE);q.onsuccess=()=>resolve(q.result);q.onerror=()=>reject(q.error)})}
async function loadVoiceprintPack(){const db=await openVoiceprintDb();const value=await new Promise((resolve,reject)=>{const tx=db.transaction(VOICEPRINT_STORE,"readonly");const q=tx.objectStore(VOICEPRINT_STORE).get("sealed");q.onsuccess=()=>resolve(q.result||null);q.onerror=()=>reject(q.error)});db.close();return value}
async function saveVoiceprintPack(bytes){const db=await openVoiceprintDb();await new Promise((resolve,reject)=>{const tx=db.transaction(VOICEPRINT_STORE,"readwrite");tx.objectStore(VOICEPRINT_STORE).put(bytes,"sealed");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
function cstr(value){return runtime.stringToNewUTF8(String(value??""))}
function jsonFrom(ptr){return ptr?runtime.UTF8ToString(ptr):"[]"}
async function persistVoiceprints(){const path=cstr("/data/voiceprints.oed");const rc=runtime._wasm_asr_voiceprint_save(path);runtime._free(path);if(rc<0)throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));await saveVoiceprintPack(runtime.FS.readFile("/data/voiceprints.oed"));}

async function fetchModel(url, checksum) {
  const request = new Request(url, { mode: "cors" });
  // Checksum-pinned assets bypass cache reads so stale/corrupt cache entries
  // cannot prevent startup. Other model files may use cache as an optimization.
  let cache = null;
  if ("caches" in self) {
    try {
      cache = await caches.open("voice-memo-ja-model-v3");
      if (!checksum) {
        const cached = await cache.match(request);
        if (cached) return cached;
      }
    } catch (error) {
      console.warn("Model cache unavailable; fetching without cache:", error);
      cache = null;
    }
  }
  let response, lastError;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(request);
      if (!response.ok) throw new Error("HTTP " + response.status);
      break;
    } catch (error) {
      lastError = error;
      if (attempt === 2) throw new Error("Model network request failed after 3 attempts: " + url + " (" + String(error?.message || error) + ")");
      await new Promise(resolve => setTimeout(resolve, 700 * (attempt + 1)));
    }
  }
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
    const response = await fetchModel(item.url, item.sha256);
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
        runtime.FS.mkdirTree("/data");
        const voiceprintPath = "/data/voiceprints.oed";
        const storedVoiceprints = await loadVoiceprintPack().catch(() => null);
        if (storedVoiceprints) runtime.FS.writeFile(voiceprintPath, new Uint8Array(storedVoiceprints));
        const effectiveOptions = [data.options || "", "embedding_model=/models/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx", "voiceprint_store=" + voiceprintPath].join(";");
        const args = [
          modelDir,
          resolve(data.vadModelPath || "silero_vad.int8.onnx"),
          resolve(paths.tokens || "tokens.txt"),
          resolve(paths.encoder || "encoder-epoch-99-avg-1.int8.onnx"),
          resolve(paths.decoder || "decoder-epoch-99-avg-1.onnx"),
          resolve(paths.joiner || "joiner-epoch-99-avg-1.onnx"),
          effectiveOptions
        ];
        const optionPtr = runtime.stringToNewUTF8(effectiveOptions);
        const optionDump = runtime._wasm_asr_options_dump(optionPtr);
        self.postMessage({ type: "options-effective", options: runtime.UTF8ToString(optionDump) });
        runtime._free(optionPtr);
        const ptrs = args.map((value) => runtime.stringToNewUTF8(value));
        const rc = runtime._wasm_asr_create(...ptrs);
        ptrs.forEach((ptr) => runtime._free(ptr));
        if (rc !== 0) throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        const diarizationAvailable = !!runtime._wasm_asr_diarization_available();
        const voiceprintAvailable = !!runtime._wasm_asr_voiceprint_available();
        if (!diarizationAvailable || !voiceprintAvailable) throw new Error("Pinned ASR library reports speaker diarization/voiceprint unavailable");
        engineReady = true;
        self.postMessage({ type: "speaker-capabilities", diarization: diarizationAvailable, voiceprint: voiceprintAvailable });
        self.postMessage({ type: "speaker-profiles", profiles: jsonFrom(runtime._wasm_asr_voiceprint_profiles()) });
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
      case "speaker-profiles": {
        if (!engineReady) throw new Error("ASR engine is not initialized");
        self.postMessage({type:"speaker-profiles",profiles:jsonFrom(runtime._wasm_asr_voiceprint_profiles()),speakers:jsonFrom(runtime._wasm_asr_speakers_json())}); break;
      }
      case "speaker-enroll": {
        if (!engineReady) throw new Error("ASR engine is not initialized");
        const samples=data.samples instanceof Float32Array?data.samples:new Float32Array(data.samples);
        const ptr=runtime._malloc(samples.byteLength);runtime.HEAPF32.set(samples,ptr>>>2);
        const id=cstr(data.id),name=cstr(data.name);
        const rc=runtime._wasm_asr_enroll_speaker(ptr,samples.length,id,name);
        runtime._free(ptr);runtime._free(id);runtime._free(name);
        if(rc<0)throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        self.postMessage({type:"speaker-enrolled",added:rc,profiles:jsonFrom(runtime._wasm_asr_voiceprint_profiles())}); break;
      }
      case "speaker-rename": {
        const id=cstr(data.id),name=cstr(data.name);const rc=runtime._wasm_asr_rename_speaker(id,name);runtime._free(id);runtime._free(name);
        if(rc<0)throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        self.postMessage({type:"speaker-profiles",profiles:jsonFrom(runtime._wasm_asr_voiceprint_profiles())}); await persistVoiceprints(); break;
      }
      case "speaker-delete": {
        const id=cstr(data.id);const rc=runtime._wasm_asr_delete_voiceprint(id);runtime._free(id);
        if(rc<0)throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        self.postMessage({type:"speaker-profiles",profiles:jsonFrom(runtime._wasm_asr_voiceprint_profiles())}); break;
      }
      case "speaker-label": {
        const id=cstr(data.id),name=cstr(data.name);const rc=runtime._wasm_asr_label_speaker(data.t0,data.t1,id,name);runtime._free(id);runtime._free(name);
        if(rc<0)throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));self.postMessage({type:"speaker-labeled",count:rc}); break;
      }
      case "speaker-merge": {
        const from=cstr(data.from),into=cstr(data.into);const rc=runtime._wasm_asr_merge_speakers(from,into);runtime._free(from);runtime._free(into);
        if(rc<0)throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));self.postMessage({type:"speaker-merged",count:rc}); break;
      }
      case "speaker-relabel": {
        const rc=runtime._wasm_asr_relabel();if(rc<0)throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));self.postMessage({type:"speaker-relabeled",count:rc}); break;
      }
      case "speaker-save": {
        const path=cstr("/data/voiceprints.oed");const rc=runtime._wasm_asr_voiceprint_save(path);runtime._free(path);
        if(rc<0)throw new Error(runtime.UTF8ToString(runtime._wasm_asr_last_error()));
        const bytes=runtime.FS.readFile("/data/voiceprints.oed");await saveVoiceprintPack(bytes);
        self.postMessage({type:"speaker-saved"}); break;
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
