const fs = require("node:fs");
const path = require("node:path");

const buildDir = path.resolve(__dirname, "..", "build-wasm");
const modelDir = path.resolve(__dirname, "..", ".cache", "ja-model", "sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01");
const fixture = path.join(modelDir, "test_wavs", "1.wav");
const vadFile = path.resolve(__dirname, "..", ".cache", "ja-model", "silero_vad.onnx");

function readPcm16MonoWav(file) {
  const b = fs.readFileSync(file);
  if (b.toString("ascii", 0, 4) !== "RIFF" || b.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Expected RIFF/WAVE fixture");
  }
  let offset = 12, sampleRate = 0, channels = 0, bits = 0, data = null;
  while (offset + 8 <= b.length) {
    const id = b.toString("ascii", offset, offset + 4);
    const size = b.readUInt32LE(offset + 4);
    const start = offset + 8;
    if (id === "fmt ") {
      const format = b.readUInt16LE(start);
      channels = b.readUInt16LE(start + 2);
      sampleRate = b.readUInt32LE(start + 4);
      bits = b.readUInt16LE(start + 14);
      if (format !== 1 || bits !== 16) throw new Error("Fixture must be PCM16");
    } else if (id === "data") {
      data = b.subarray(start, start + size);
      break;
    }
    offset = start + size + (size & 1);
  }
  if (!data || channels !== 1) throw new Error("Fixture must contain mono PCM16");
  let pcm = new Float32Array(data.length / 2);
  for (let i = 0; i < pcm.length; i++) pcm[i] = data.readInt16LE(i * 2) / 32768;
  if (sampleRate !== 16000) {
    const outLength = Math.floor(pcm.length * 16000 / sampleRate);
    const out = new Float32Array(outLength);
    for (let i = 0; i < outLength; i++) {
      const p = i * sampleRate / 16000;
      const lo = Math.floor(p), hi = Math.min(lo + 1, pcm.length - 1);
      out[i] = pcm[lo] + (pcm[hi] - pcm[lo]) * (p - lo);
    }
    pcm = out;
  }
  return pcm;
}

async function main() {
  for (const file of [fixture, vadFile,
    path.join(modelDir, "encoder-epoch-99-avg-1.int8.onnx"),
    path.join(modelDir, "decoder-epoch-99-avg-1.onnx"),
    path.join(modelDir, "joiner-epoch-99-avg-1.int8.onnx"),
    path.join(modelDir, "tokens.txt")]) {
    if (!fs.existsSync(file)) throw new Error("Missing E2E input: " + file);
  }

  const events = [];
  const factory = require(path.join(buildDir, "sherpa_embed_asr_wasm.js"));
  const Module = await factory({
    locateFile: (name) => path.join(buildDir, name),
    onAsrEvent: (event) => {
      events.push(event);
      if (event.text) process.stdout.write("[ASR " + event.type + "] " + event.text + "\n");
    },
    print: (s) => process.stdout.write(s + "\n"),
    printErr: (s) => process.stderr.write(s + "\n")
  });

  const virtualModelDir = "/models/ja";
  Module.FS.mkdirTree(virtualModelDir);
  for (const name of [
    "encoder-epoch-99-avg-1.int8.onnx",
    "decoder-epoch-99-avg-1.onnx",
    "joiner-epoch-99-avg-1.int8.onnx",
    "tokens.txt"
  ]) {
    Module.FS.writeFile(virtualModelDir + "/" + name, fs.readFileSync(path.join(modelDir, name)));
  }
  Module.FS.mkdirTree("/models");
  Module.FS.writeFile("/models/silero_vad.onnx", fs.readFileSync(vadFile));

  const strings = [
    virtualModelDir,
    "/models/silero_vad.onnx",
    virtualModelDir + "/tokens.txt",
    virtualModelDir + "/encoder-epoch-99-avg-1.int8.onnx",
    virtualModelDir + "/decoder-epoch-99-avg-1.onnx",
    virtualModelDir + "/joiner-epoch-99-avg-1.int8.onnx"
  ];
  const ptrs = strings.map((s) => Module.stringToNewUTF8(s));
  const rc = Module._wasm_asr_create(...ptrs);
  ptrs.forEach((p) => Module._free(p));
  if (rc !== 0) throw new Error("WASM ASR init failed: " + Module.UTF8ToString(Module._wasm_asr_last_error()));

  const pcm = readPcm16MonoWav(fixture);
  const chunk = 1600; // 100 ms at 16 kHz
  for (let i = 0; i < pcm.length; i += chunk) {
    const part = pcm.subarray(i, Math.min(i + chunk, pcm.length));
    const ptr = Module._malloc(part.byteLength);
    Module.HEAPF32.set(part, ptr >>> 2);
    const pushRc = Module._wasm_asr_push_pcm(ptr, part.length);
    Module._free(ptr);
    if (pushRc !== 0) throw new Error("PCM push failed: " + Module.UTF8ToString(Module._wasm_asr_last_error()));
  }
  const flushRc = Module._wasm_asr_flush();
  if (flushRc !== 0) throw new Error("Flush failed: " + Module.UTF8ToString(Module._wasm_asr_last_error()));
  Module._wasm_asr_destroy();

  const finals = events.filter((e) => e.type === 2 && e.text && e.text.trim());
  if (finals.length === 0) throw new Error("No Japanese ASR_EVENT_FINAL was emitted");
  const transcript = finals.map((e) => e.text).join("").trim();
  if (!/[ぁ-んァ-ヶ一-龯]/u.test(transcript)) {
    throw new Error("Final transcript contains no Japanese characters: " + transcript);
  }
  console.log("WASM_JA_E2E_SUCCESS final_events=" + finals.length);
  console.log("TRANSCRIPT=" + transcript);
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
