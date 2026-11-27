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

const MODEL_DB = "vnn-asr-model-cache";
const MODEL_STORE = "models";
const MODEL_CACHE_VERSION = "v1";
function openModelDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(MODEL_DB, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(MODEL_STORE)) db.createObjectStore(MODEL_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Model storage unavailable"));
  });
}
async function readCachedModel(key) {
  const db = await openModelDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, "readonly");
      const request = tx.objectStore(MODEL_STORE).get(key);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  } finally { db.close(); }
}
async function writeCachedModel(key, record) {
  const db = await openModelDb();
  try {
    await new Promise((resolve, reject) => {
      const tx = db.transaction(MODEL_STORE, "readwrite");
      tx.objectStore(MODEL_STORE).put(record, key);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error("Model cache write failed"));
      tx.onabort = () => reject(tx.error || new Error("Model cache transaction aborted"));
    });
  } finally { db.close(); }
}
async function sha256Hex(bytes) {
  if (!self.crypto?.subtle) throw new Error("SHA-256 verification unavailable");
  const digest = await self.crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), value => value.toString(16).padStart(2, "0")).join("");
}
async function fetchModel(item) {
  const cacheKey = MODEL_CACHE_VERSION + ":" + item.path;
  const cached = await readCachedModel(cacheKey).catch(error => {
    console.warn("Persistent model cache read failed:", error);
    return null;
  });
  if (cached?.bytes) {
    const bytes = cached.bytes instanceof ArrayBuffer ? cached.bytes : cached.bytes.buffer;
    const actual = await sha256Hex(bytes);
    if (actual === cached.sha256 && (!item.sha256 || actual === item.sha256.toLowerCase())) {
      self.postMessage({ type: "model-cache-hit", path: item.path, bytes: bytes.byteLength });
      return new Uint8Array(bytes);
    }
    console.warn("Discarding corrupted/stale local model:", item.path);
  }
  if (self.navigator && self.navigator.onLine === false) {
    throw new Error("オフラインですが端末内にモデルがありません: " + item.path + "。オンライン時にモデル準備を完了してください。");
  }
  const candidates = [item.url, ...(item.fallbackUrl && item.fallbackUrl !== item.url ? [item.fallbackUrl] : [])];
  let lastError = null;
  for (const candidate of candidates) {
    for (let attempt = 0; attempt < 3; attempt++) {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 120000);
      try {
        const response = await fetch(new Request(candidate, { mode: "cors" }), {
          signal: controller.signal,
          cache: "no-store"
        });
        if (!response.ok) throw new Error("HTTP " + response.status);
        const bytes = await response.arrayBuffer();
        if (!bytes.byteLength) throw new Error("Empty response");
        const actual = await sha256Hex(bytes);
        if (item.sha256 && actual !== item.sha256.toLowerCase()) {
          throw new Error("SHA-256 mismatch: expected " + item.sha256 + ", got " + actual);
        }
        clearTimeout(timeoutId);
        const record = {
          bytes,
          sha256: actual,
          expectedSha256: item.sha256 || null,
          modelVersion: MODEL_CACHE_VERSION,
          savedAt: Date.now(),
          size: bytes.byteLength
        };
        await writeCachedModel(cacheKey, record);
        self.postMessage({ type: "model-cached", path: item.path, bytes: bytes.byteLength, sha256: actual });
        return new Uint8Array(bytes);
      } catch (error) {
        clearTimeout(timeoutId);
        lastError = error;
        const reason = error?.name === "AbortError" ? "120s timeout" : String(error?.message || error);
        console.warn("Model fetch/integrity retry", attempt + 1, candidate, reason);
        if (/HTTP 404|HTTP 403|SHA-256 mismatch/.test(reason)) break;
        if (attempt < 2) await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
      }
    }
  }
  throw new Error("モデル取得・検証・端末保存に失敗: " + item.path + " (" + String(lastError?.message || lastError) + ")");
}
async function installModelFiles(files, modelRoot) {
  const root = modelRoot || "/models";
  runtime.FS.mkdirTree(root);
  let completed = 0;
  for (const item of (files || [])) {
    if (!item || typeof item.url !== "string" || typeof item.path !== "string") throw new Error("Invalid model file descriptor");
    let relative = item.path;
    while (relative.startsWith("/")) relative = relative.slice(1);
    if (relative.split("/").some(part => part === "..")) throw new Error("Model path traversal rejected");
    const target = root + "/" + relative;
    const slash = target.lastIndexOf("/");
    if (slash > 0) runtime.FS.mkdirTree(target.slice(0, slash));
    try {
      const bytes = await fetchModel(item);
      runtime.FS.writeFile(target, bytes);
      completed++;
      self.postMessage({ type: "model-file-ready", path: target, completed, total: files.length });
    } catch (error) {
      throw new Error("Failed model " + item.path + ": " + String(error?.message || error));
    }
  }
  self.postMessage({ type: "models-ready", count: completed });
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
