const $=s=>document.querySelector(s);
const TRANSCRIPT_KEY="vnnTranscript";
const AUDIO_DB="vnn-local-data",AUDIO_STORE="recordings";
function openLocalDb(){return new Promise((resolve,reject)=>{const req=indexedDB.open(AUDIO_DB,1);req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains(AUDIO_STORE))req.result.createObjectStore(AUDIO_STORE)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)})}
async function saveAudioLocally(blob){if(!blob)return;const db=await openLocalDb();await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,"readwrite");tx.objectStore(AUDIO_STORE).put(blob,"latest");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}
async function loadAudioLocally(){const db=await openLocalDb();const blob=await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,"readonly");const req=tx.objectStore(AUDIO_STORE).get("latest");req.onsuccess=()=>resolve(req.result||null);req.onerror=()=>reject(req.error)});db.close();return blob}
async function clearAudioLocally(){try{const db=await openLocalDb();await new Promise((resolve,reject)=>{const tx=db.transaction(AUDIO_STORE,"readwrite");tx.objectStore(AUDIO_STORE).delete("latest");tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)});db.close()}catch(error){console.warn("Local audio cleanup failed",error)}}
let transcriptPersistTimer=0;
function flushTranscriptPersistence(){
 if(transcriptPersistTimer){clearTimeout(transcriptPersistTimer);transcriptPersistTimer=0}
 try{
  const normalized=normalizeTranscriptText(textArea.value);
  if(normalized!==textArea.value){textArea.value=normalized;fitTranscriptArea();transcriptLogicalLength=normalized.length}
  localStorage.setItem(TRANSCRIPT_KEY,normalized);
  localStorage.setItem("vnnTranscriptSegments",JSON.stringify(transcriptSegments));
 }catch(error){console.warn("Transcript persistence failed",error)}
}
function persistTranscript(){
 if(transcriptPersistTimer)clearTimeout(transcriptPersistTimer);
 transcriptPersistTimer=setTimeout(flushTranscriptPersistence,350);
}
addEventListener("pagehide",flushTranscriptPersistence);

const recordBtn=$("#recordBtn"),stopBtn=$("#stopBtn"),timerEl=$("#timer"),statusText=$("#statusText"),dot=$("#recordDot"),textArea=$("#text"),audioEl=$("#audio"),historyEl=$("#history");
const installBtn=$("#installBtn");
const appVersion=$("#appVersion");
fetch("./VERSION").then(r=>r.ok?r.text():Promise.reject()).then(v=>{appVersion.textContent=v.trim();document.title="文字起こしアプリ v"+v.trim()}).catch(()=>{appVersion.textContent="0.1.0";document.title="文字起こしアプリ v0.1.0"});
const settingsDefaults={saveAudio:true,timestamps:false,speakerDisplay:false,vadSensitivity:"0.25",minSilence:"0.5",maxPaths:"8",dictionary:[],speakers:[]};
let settings={...settingsDefaults};
try{settings={...settingsDefaults,...JSON.parse(localStorage.getItem("vnnSettings")||"{}")}}catch{}
function persistSettings(){localStorage.setItem("vnnSettings",JSON.stringify(settings))}
function renderSettingsListsOnce(){
 const render=(id,items,key)=>{const root=$(id);root.innerHTML="";items.forEach((value,i)=>{const row=document.createElement("div");row.className="list-item";const span=document.createElement("span");span.textContent=value;const remove=document.createElement("button");remove.textContent="削除";remove.onclick=()=>{settings[key].splice(i,1);persistSettings();renderSettingsListsOnce()};row.append(span,remove);root.append(row)})};
 render("#dictionaryList",settings.dictionary,"dictionary");const speakerRoot=$("#speakerList");speakerRoot.innerHTML="";settings.speakers.forEach((name,i)=>{const row=document.createElement("div"),label=document.createElement("span"),remove=document.createElement("button");row.className="list-item";label.textContent="話者"+(i+1)+" (ID "+i+"): "+name;remove.textContent="削除";remove.onclick=()=>{settings.speakers.splice(i,1);persistSettings();renderSettingsListsOnce()};row.append(label,remove);speakerRoot.append(row)});
}
function openSettings(){$("#saveAudioSetting").checked=!!settings.saveAudio;$("#timestampSetting").checked=!!settings.timestamps;$("#speakerDisplaySetting").checked=!!settings.speakerDisplay;$("#vadSensitivity").value=settings.vadSensitivity;$("#minSilence").value=settings.minSilence;$("#maxPaths").value=settings.maxPaths;renderSettingsListsOnce();renderSpeakerProfiles();$("#settingsPanel").classList.add("open")}
function closeSettings(){$("#settingsPanel").classList.remove("open")}

let recorder=null,chunks=[],audioBlob=null,audioUrl=null,startedAt=0,timerId=null,deferredInstallPrompt=null;
let activeAudioSource=null,audioInputMode="mic";
let transcriptSegments=[],internalTranscriptUpdate=false,settingsDirty=false;let transcriptLogicalLength=0;const transcriptQueue=[];let transcriptTypingTimer=0;
function normalizeTranscriptText(value){
 let text=String(value??"");
 for(let pass=0;pass<4;pass++){
  const normalized=text
   .replace(/\\+u000d\\+u000a/gi,"\n")
   .replace(/\\+u000a/gi,"\n")
   .replace(/\\+u000d/gi,"\n")
   .replace(/\\+r\\+n/gi,"\n")
   .replace(/\\+n/gi,"\n")
   .replace(/\\+r/gi,"\n");
  if(normalized===text)break;
  text=normalized;
 }
 return text.replace(/\r\n?/g,"\n");
}
try{const storedTranscript=localStorage.getItem(TRANSCRIPT_KEY)||"";textArea.value=normalizeTranscriptText(storedTranscript);transcriptSegments=JSON.parse(localStorage.getItem("vnnTranscriptSegments")||"[]");if(textArea.value!==storedTranscript){transcriptSegments=[];localStorage.setItem("vnnTranscriptSegments","[]");localStorage.setItem(TRANSCRIPT_KEY,textArea.value)}}catch{transcriptSegments=[]}transcriptLogicalLength=textArea.value.length;fitTranscriptArea();
async function restoreSavedAudio(){if(!settings.saveAudio)return;try{const blob=await loadAudioLocally();if(!blob)return;attachAudioBlob(blob);status("保存済み音声を準備しました")}catch(error){console.warn("Saved audio restore failed",error)}}

let asrWorker=null,audioContext=null,mediaStream=null,sourceNode=null,workletNode=null,asrReady=false,asrStarting=null;
const MODEL_READY_KEY="vnnAsrModelReady",MODEL_READY_VALUE="13b4596";
function hasConfirmedModelSetup(){try{return localStorage.getItem(MODEL_READY_KEY)===MODEL_READY_VALUE}catch{return false}}
function markModelSetupReady(){try{localStorage.setItem(MODEL_READY_KEY,MODEL_READY_VALUE)}catch(error){console.warn("Model-ready marker persistence failed",error)}}
let enrollmentChunks=[],enrollmentSamples=0,speakerProfiles=[];const ENROLLMENT_MAX_SAMPLES=16000*10;
const MODEL_REV="13b4596";
const MODEL_BASE="https://huggingface.co/DeL-TaiseiOzaki/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01/resolve/"+MODEL_REV+"/";
const MODEL_FILES=[
 // Prefer same-origin bundled assets. After first verified download, the Worker stores model bytes in Cache Storage for offline reuse.
 {url:"./models/ja/tokens.txt",fallbackUrl:MODEL_BASE+"tokens.txt",path:"ja/tokens.txt"},
 {url:"./models/silero_vad.onnx",fallbackUrl:"https://huggingface.co/daxpatel235/silero-vad/resolve/main/silero_vad.onnx",path:"silero_vad.onnx",sha256:"9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6"},
 {url:"./models/ja/encoder-epoch-99-avg-1.int8.onnx",fallbackUrl:MODEL_BASE+"encoder-epoch-99-avg-1.int8.onnx",path:"ja/encoder-epoch-99-avg-1.int8.onnx"},
 {url:"./models/ja/decoder-epoch-99-avg-1.onnx",fallbackUrl:MODEL_BASE+"decoder-epoch-99-avg-1.onnx",path:"ja/decoder-epoch-99-avg-1.onnx"},
 {url:"./models/ja/joiner-epoch-99-avg-1.onnx",fallbackUrl:MODEL_BASE+"joiner-epoch-99-avg-1.onnx",path:"ja/joiner-epoch-99-avg-1.onnx"},
 {url:"./models/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx",fallbackUrl:"https://huggingface.co/csukuangfj/speaker-embedding-models/resolve/8be2a75c9ed7a590538b268e46fbb65e1aa9d208/3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx",path:"3dspeaker_speech_campplus_sv_zh-cn_16k-common.onnx",sha256:"f682b514c05d947ee3fa91cd6ec6c5c7543479a128373fa29b1faedccd21fd11"}
];
function fmt(ms){const sec=Math.floor(ms/1000);return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")}
function status(s,active=false){
 const track=statusText.querySelector(".status-track")||statusText;
 track.textContent=String(s??"");
 statusText.classList.remove("is-marquee");
 track.style.animationDuration="";
 requestAnimationFrame(()=>{
  const overflow=track.scrollWidth>statusText.clientWidth+2;
  if(overflow){
   const label=String(s??"");
   track.textContent=label+"　　　"+label;
   const duration=Math.max(8,Math.min(30,label.length*0.42));
   track.style.setProperty("--marquee-duration",duration+"s");
   statusText.classList.add("is-marquee");
  }
 });
 dot.classList.toggle("active",active);
}
function fitTranscriptArea(){
 textArea.style.height="auto";
 textArea.style.height=Math.max(textArea.scrollHeight,Math.ceil(parseFloat(getComputedStyle(textArea).lineHeight)*2))+"px";
}
function typeNextTranscriptCharacter(){
 transcriptTypingTimer=0;
 if(!transcriptQueue.length)return;
 const job=transcriptQueue[0];
 if(job.index<job.characters.length){
  textArea.value+=job.characters[job.index++];
  fitTranscriptArea();
  textArea.scrollTop=textArea.scrollHeight;
  transcriptTypingTimer=setTimeout(typeNextTranscriptCharacter,22);
 }else{
  transcriptQueue.shift();
  persistTranscript();
  if(transcriptQueue.length)transcriptTypingTimer=setTimeout(typeNextTranscriptCharacter,22);
 }
}
function enqueueTranscriptText(value){
 const content=normalizeTranscriptText(value);
 if(!content)return;
 transcriptLogicalLength+=content.length;
 transcriptQueue.push({characters:Array.from(content),index:0});
 if(!transcriptTypingTimer)transcriptTypingTimer=setTimeout(typeNextTranscriptCharacter,22);
}
function setTimer(){timerEl.textContent=fmt(Date.now()-startedAt)}
function cleanUrl(){if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null}}
function attachAudioBlob(blob){if(!blob)return;audioEl.pause();audioBlob=blob;cleanUrl();audioUrl=URL.createObjectURL(blob);audioEl.preload="metadata";audioEl.src=audioUrl;audioEl.load();audioEl.classList.add("hide");$("#playbackRail").style.display="flex";$(".transcript").classList.add("has-playback");$("#downloadAudioBtn").disabled=false;playbackFocusedSegmentKey="";updatePlaybackCursor();}
function workerMessage({data}){
 if(data.type==="log")return;
 if(data.type==="options-effective"){try{const parsed=JSON.parse(data.options);console.info("ASR effective options",parsed);status("ASR設定を読み込みました")}catch(error){console.error("ASR option diagnostic parse failed",data.options,error);status("ASR設定の診断に失敗しました")}return;}
 if(data.type==="model-file-ready"){status("モデル準備 "+data.completed+"/"+data.total+"："+data.path.split("/").pop(),true);return}
 if(data.type==="model-cache-hit"){status("端末内モデルを復元中… "+data.path.split("/").pop(),true);return}
 if(data.type==="model-cached"){status("モデルを端末に保存しました："+data.path.split("/").pop(),true);return}
 if(data.type==="models-ready"){status("全"+data.count+"モデルを端末内に保存しました");return}
 if(data.type==="speaker-profiles"){try{speakerProfiles=JSON.parse(data.profiles||"[]");renderSpeakerProfiles()}catch(e){console.warn(e)}return}
 if(data.type==="speaker-enrolled"){try{speakerProfiles=JSON.parse(data.profiles||"[]");renderSpeakerProfiles();asrWorker?.postMessage({type:"speaker-save"})}catch{}status("声紋を登録しました ("+data.added+" サンプル)");return}
 if(data.type==="speaker-saved"){status("声紋を暗号化して端末に保存しました");return}
 if(data.type==="speaker-labeled"){status("選択区間の話者ラベルを更新しました");return}
 if(data.type==="speaker-relabeled"){status("会議全体の話者ラベルを再判定しました");return}
 if(data.type==="speaker-merged"){status("話者を統合しました");return}
 if(data.type==="speaker-capabilities"&&(!data.diarization||!data.voiceprint)){status("話者識別機能を初期化できませんでした");return}
 if(data.type==="ready"){asrReady=true;markModelSetupReady();asrWorker?.postMessage({type:"speaker-profiles"});status("日本語音声認識・話者識別の準備完了");return}
 if(data.type==="asr-event"){
  const event=data.event||{};
  if(event.type===9){const seg=transcriptSegments.find(x=>Math.abs(x.t0-Number(event.t0))<0.03&&Math.abs(x.t1-Number(event.t1))<0.03);if(seg){const label=settings.speakerDisplay?(event.speakerName?"["+event.speakerName+"] ":event.speaker?"["+event.speaker+"] ":""):"";const oldLength=seg.labelEnd-seg.labelStart;internalTranscriptUpdate=true;textArea.setRangeText(label,seg.labelStart,seg.labelEnd,"preserve");const delta=label.length-oldLength;seg.labelEnd=seg.labelStart+label.length;seg.start+=delta;seg.end+=delta;seg.speaker=event.speaker||"";seg.speakerName=event.speakerName||"";for(const item of transcriptSegments){if(item!==seg&&item.start>=seg.end-delta){item.start+=delta;item.end+=delta;item.labelStart+=delta;item.labelEnd+=delta}}internalTranscriptUpdate=false;persistTranscript()}return}
  if(event.type===8){status("複数話者の重なりを検出しました");return}
  if(event.text&&event.text.trim()){
    if(event.type===2){const stamp=settings.timestamps?"["+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+"] ":"";const speakerId=String(event.speaker??"").trim();const speakerName=event.speakerStatus==="identified"?String(event.speakerName||""):"";const speakerLabel=settings.speakerDisplay?(speakerName?"["+speakerName+"] ":speakerId?"["+speakerId+"] ":""):"";const recognizedText=normalizeTranscriptText(event.text).trim();const prefix=transcriptLogicalLength?"\n":"";const labelStart=transcriptLogicalLength+prefix.length+stamp.length;const start=labelStart+speakerLabel.length;enqueueTranscriptText(prefix+stamp+speakerLabel+recognizedText);transcriptSegments.push({t0:Number(event.t0)||0,t1:Number(event.t1)||0,start,end:start+recognizedText.length,labelStart,labelEnd:start,speaker:speakerId,speakerName})}
   else if(event.type===1){status("認識中… "+event.text.trim(),true)}
  }
  return;
 }
 if(data.type==="error"){status("ASRエラー: "+data.message);console.error(data.message);return}
 if(data.type==="accepted"||data.type==="flushed"||data.type==="closed")return;
}
async function ensureAsr(){
 if(asrReady&&settingsDirty){asrWorker?.terminate();asrWorker=null;asrReady=false;settingsDirty=false;}
 if(asrReady)return;
 if(asrStarting)return asrStarting;
 asrStarting=(async()=>{
  if(!window.Worker||!window.AudioWorkletNode||!window.AudioContext)throw new Error("このブラウザはAudioWorklet/Workerに対応していません");
  asrWorker=new Worker("./web/wasm/asr-worker.js");
  asrWorker.onmessage=workerMessage;
  asrWorker.onerror=e=>{const detail=e.message||"unknown worker error";status("Workerエラー: "+detail);console.error("ASR_WORKER_ERROR",detail,e.filename||"",e.lineno||0)};
  const ready=new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error("WASM/モデル初期化がタイムアウトしました")),15*60*1000);
   const cleanup=()=>{clearTimeout(timeout);asrWorker?.removeEventListener("message",listener);asrWorker?.removeEventListener("error",workerError)};
   const listener=({data})=>{
    if(data.type==="ready"){cleanup();resolve()}
    if(data.type==="error"){cleanup();reject(new Error(data.message))}
   };
   const workerError=(event)=>{cleanup();reject(new Error("ASR Worker startup failed: "+(event.message||"worker error")))};
   asrWorker.addEventListener("message",listener);
   asrWorker.addEventListener("error",workerError);
  });
  asrWorker.postMessage({
   type:"init",
   wasmJsUrl:new URL("./web/wasm/dist/sherpa_embed_asr_wasm.js",location.href).toString(),
   wasmBaseUrl:new URL("./web/wasm/dist/",location.href).toString(),
   modelRoot:"/models",modelSubdir:"ja",modelFiles:MODEL_FILES,
   vadModelPath:"/models/silero_vad.onnx",
   modelPaths:{tokens:"tokens.txt",encoder:"encoder-epoch-99-avg-1.int8.onnx",decoder:"decoder-epoch-99-avg-1.onnx",joiner:"joiner-epoch-99-avg-1.onnx"},options:"vad_threshold="+settings.vadSensitivity+";vad_min_silence="+settings.minSilence+";max_active_paths="+settings.maxPaths
  });
  await ready;
 })();
 try{await asrStarting}catch(error){
  asrWorker?.terminate();asrWorker=null;asrReady=false;
  throw error;
 }finally{asrStarting=null}
}
async function startLivePcm(stream){
 if(!audioContext)audioContext=new AudioContext({latencyHint:"interactive"});
 if(audioContext.state==="suspended")await audioContext.resume();
 await audioContext.audioWorklet.addModule("./web/wasm/pcm-worklet.js");
 sourceNode=audioContext.createMediaStreamSource(stream);
 workletNode=new AudioWorkletNode(audioContext,"pcm-16k-processor",{numberOfInputs:1,numberOfOutputs:1,channelCount:1});
 workletNode.port.onmessage=({data})=>{if(data.type!=="pcm"||!asrReady)return;const samples=data.samples;if(enrollmentSamples<ENROLLMENT_MAX_SAMPLES){const keep=Math.min(samples.length,ENROLLMENT_MAX_SAMPLES-enrollmentSamples);if(keep>0){enrollmentChunks.push(samples.subarray(0,keep).slice());enrollmentSamples+=keep}}asrWorker.postMessage({type:"audio",samples},[samples.buffer]);};
 sourceNode.connect(workletNode);
 // Keep the processing graph alive without sending microphone audio to speakers.
 const silent=audioContext.createGain();silent.gain.value=0;
 workletNode.connect(silent);silent.connect(audioContext.destination);
}
async function stopLivePcm(){
 try{workletNode?.port.close();workletNode?.disconnect();sourceNode?.disconnect();if(audioContext&&audioContext.state!=="closed")await audioContext.close()}catch(e){console.warn(e)}
 workletNode=null;sourceNode=null;audioContext=null;
 if(asrReady)asrWorker.postMessage({type:"flush"});
}
function updateAudioInputButton(){
 const button=$("#inputSourceBtn");
 const system=audioInputMode==="system";
 button.textContent=system?"タブ音声":"マイク";
 button.title=system?"入力: ブラウザタブ音声":"入力: マイク";
 button.setAttribute("aria-label",button.title+"。タップして切替");
}
$("#inputSourceBtn").addEventListener("click",()=>{
 if(recorder?.state==="recording"||recordBtn.disabled)return;
 const next=audioInputMode==="mic"?"system":"mic";
 if(next==="system"&&!window.VnnAudioSources?.isSupported("system")){
  status("このブラウザではタブ音声共有に対応していません");
  return;
 }
 audioInputMode=next;
 updateAudioInputButton();
 status(next==="system"?"入力方式: ブラウザタブ音声":"入力方式: マイク");
});
updateAudioInputButton();

recordBtn.addEventListener("click",async()=>{
 if(recorder?.state==="recording"){stopBtn.click();return}
 if(!window.MediaRecorder||!window.VnnAudioSources){status("このブラウザでは音声入力に対応していません");return}
 recordBtn.disabled=true;recordBtn.textContent="…";
 if(!asrReady&&!hasConfirmedModelSetup()&&!confirm("初回は日本語ASR・VAD・話者識別モデルをダウンロードして端末に保存します。完了後はオフラインで利用できます。続行しますか？")){
  recordBtn.disabled=false;recordBtn.textContent="●";return
 }
 status(hasConfirmedModelSetup()?"保存済みモデルを確認しています…":"ASRと日本語モデルを準備しています…",true);
 try{
  activeAudioSource=window.VnnAudioSources.create(audioInputMode);
  activeAudioSource.onEnded=()=>{
   if(recorder?.state==="recording")stopBtn.click();
   else status("音声入力が終了しました");
  };
  // Invoke both browser capture and AudioContext resume synchronously from
  // the user gesture before awaiting either permission/policy-gated promise.
  audioContext=new AudioContext({latencyHint:"interactive"});
  const [capturedStream]=await Promise.all([activeAudioSource.start(),audioContext.resume()]);
  mediaStream=capturedStream;
  if(!mediaStream?.getAudioTracks?.().length)throw new Error("音声トラックを取得できませんでした");
  if(navigator.storage?.persist){navigator.storage.persist().then(persisted=>console.info("Persistent storage granted:",persisted)).catch(error=>console.warn("Persistent storage request failed",error))}
  await ensureAsr();
  await startLivePcm(mediaStream);
  chunks=[];enrollmentChunks=[];enrollmentSamples=0;audioBlob=null;cleanUrl();audioEl.classList.add("hide");audioEl.removeAttribute("src");
  recorder=new MediaRecorder(mediaStream);
  recorder.ondataavailable=e=>{if(settings.saveAudio&&e.data.size)chunks.push(e.data)};
  recorder.onstop=async()=>{
   audioBlob=settings.saveAudio&&chunks.length?new Blob(chunks,{type:recorder.mimeType||"audio/webm"}):null;
   if(audioBlob){
    try{await saveAudioLocally(audioBlob)}catch(error){console.warn("Audio persistence failed",error);status("録音音声を端末に保存できませんでした")}
    attachAudioBlob(audioBlob);audioEl.currentTime=0;
   }else{
    await clearAudioLocally();audioEl.classList.add("hide");$("#downloadAudioBtn").disabled=true;$("#playbackRail").style.display="none";$(".transcript").classList.remove("has-playback");
   }
   try{await activeAudioSource?.stop()}catch(error){console.warn("Audio source cleanup failed",error)}
   activeAudioSource=null;mediaStream=null;
   status("録音・認識を終了しました");recordBtn.textContent="●";recordBtn.disabled=false;stopBtn.disabled=true;
  };
  recorder.start(500);startedAt=Date.now();setTimer();timerId=setInterval(setTimer,1000);recordBtn.textContent="■";recordBtn.disabled=false;stopBtn.disabled=false;
  status(audioInputMode==="system"?"タブ音声・日本語認識中…":"録音・日本語認識中…",true);
 }catch(err){
  const message=err.name==="NotAllowedError"?(audioInputMode==="system"?"画面・音声共有が許可されていません":"マイクの使用が許可されていません"):err.message||"認識を開始できません";
  status("開始エラー: "+message);console.error(err);
  try{await activeAudioSource?.stop()}catch(cleanupError){console.warn(cleanupError)}
  activeAudioSource=null;mediaStream=null;recordBtn.textContent="●";recordBtn.disabled=false;stopBtn.disabled=true;
  try{if(audioContext&&audioContext.state!=="closed")await audioContext.close()}catch{}audioContext=null;
 }
});
stopBtn.addEventListener("click",async()=>{
 if(recorder?.state==="recording"){
  stopBtn.disabled=true;
  await stopLivePcm();
  recorder.stop();clearInterval(timerId);
  recordBtn.textContent="●";recordBtn.disabled=false;
 }
});
$("#openAudioBtn").addEventListener("click",()=>$("#audioFileInput").click());
$("#audioFileInput").addEventListener("change",async event=>{const file=event.target.files?.[0];event.target.value="";if(!file)return;if(recorder?.state==="recording"){status("音声ファイルを開く前に録音を停止してください");return}if(!file.type.startsWith("audio/")&&!/\.(mp3|m4a|aac|wav|flac|ogg|opus|webm|mp4)$/i.test(file.name)){status("対応する音声ファイルを選択してください");return}try{attachAudioBlob(file);if(settings.saveAudio)await saveAudioLocally(file);status("音声を準備しました。読み込みながらシークできます")}catch(error){console.error("Local audio open failed",error);status("音声ファイルを開けませんでした")}});
$("#downloadAudioBtn").addEventListener("click",()=>{if(!audioBlob)return;const a=document.createElement("a");a.href=audioUrl;a.download="voice-memo-"+new Date().toISOString().replace(/[:.]/g,"-")+".webm";a.click()});

$("#exportBtn").addEventListener("click",()=>{const blob=new Blob([textArea.value],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="transcription.txt";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
function loadHistory(){let list=[];try{list=JSON.parse(localStorage.getItem("voiceMemoHistory")||"[]")}catch{};historyEl.innerHTML="";if(!list.length){historyEl.innerHTML='<p class="hint">保存した履歴はここに表示されます。</p>';return}list.slice(0,30).forEach(item=>{const row=document.createElement("div");row.className="history-item";const label=document.createElement("span");label.textContent=item.date;const open=document.createElement("button");open.textContent="開く";open.onclick=()=>{const value=normalizeTranscriptText(item.text);if(transcriptTypingTimer)clearTimeout(transcriptTypingTimer);transcriptTypingTimer=0;transcriptQueue.length=0;transcriptSegments=[];transcriptLogicalLength=value.length;textArea.value=value;fitTranscriptArea();persistTranscript()};row.append(label,open);historyEl.append(row)})}
$("#saveBtn").addEventListener("click",()=>{const value=textArea.value.trim();if(!value){status("保存するテキストがありません");return}let list=[];try{list=JSON.parse(localStorage.getItem("voiceMemoHistory")||"[]")}catch{};list.unshift({date:new Date().toLocaleString("ja-JP"),text:value});localStorage.setItem("voiceMemoHistory",JSON.stringify(list.slice(0,30)));loadHistory();status("履歴に保存しました")});
$("#clearBtn").addEventListener("click",()=>{if(!confirm("文字起こしテキストと録音データをクリアしますか？"))return;if(transcriptTypingTimer)clearTimeout(transcriptTypingTimer);transcriptTypingTimer=0;transcriptQueue.length=0;transcriptLogicalLength=0;transcriptSegments=[];textArea.value="";fitTranscriptArea();persistTranscript();localStorage.removeItem("vnnTranscriptSegments");audioEl.pause();audioEl.classList.add("hide");audioBlob=null;cleanUrl();clearAudioLocally();$("#downloadAudioBtn").disabled=true;timerEl.textContent="00:00";$("#playbackRail").style.display="none";$(".transcript").classList.remove("has-playback");status("待機中")});
loadHistory();
restoreSavedAudio();
$("#connection").textContent=navigator.onLine?"オンライン":"オフライン";
addEventListener("online",()=>$("#connection").textContent="オンライン");addEventListener("offline",()=>$("#connection").textContent="オフライン");
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;installBtn.hidden=false});
installBtn.addEventListener("click",async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;installBtn.hidden=true});
window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;installBtn.hidden=true;status("アプリをインストールしました")});
if("serviceWorker" in navigator&&location.protocol!=="file:"){navigator.serviceWorker.register("./sw.js",{updateViaCache:"none"}).then(registration=>registration.update().catch(error=>console.info("Service Worker update check deferred",error))).catch(error=>{console.warn("Service Worker registration failed",error);status("オフライン機能の初期化に失敗しました")})}

$("#settingsBtn").addEventListener("click",openSettings);$("#settingsClose").addEventListener("click",closeSettings);$("#settingsPanel").addEventListener("click",e=>{if(e.target.id==="settingsPanel")closeSettings()});
$("#saveAudioSetting").addEventListener("change",e=>{settings.saveAudio=e.target.checked;persistSettings();if(!settings.saveAudio){audioBlob=null;cleanUrl();clearAudioLocally();audioEl.classList.add("hide");$("#downloadAudioBtn").disabled=true}});
$("#timestampSetting").addEventListener("change",e=>{settings.timestamps=e.target.checked;persistSettings()});
$("#speakerDisplaySetting").addEventListener("change",e=>{settings.speakerDisplay=e.target.checked;persistSettings()});
["vadSensitivity","minSilence","maxPaths"].forEach(id=>$("#"+id).addEventListener("change",e=>{settings[id]=e.target.value;settingsDirty=true;persistSettings();status("認識パラメータは次回の録音開始時にエンジンを再初期化して適用します")}));
function getPlaybackDuration(){const duration=Number(audioEl.duration);if(Number.isFinite(duration)&&duration>0)return duration;try{const ranges=audioEl.seekable;if(ranges.length){const end=ranges.end(ranges.length-1);if(Number.isFinite(end)&&end>0)return end}}catch{}return 0}
function seekFromPointerY(clientY){
 const rail=$("#playRail"),duration=getPlaybackDuration();
 if(!audioBlob){status("再生できる音声ファイルがありません");return false}
 if(duration<=0){status("音声の長さを解析中です…",true);return false}
 const rect=rail.getBoundingClientRect();
 if(rect.height<=0)return false;
 const ratio=Math.max(0,Math.min(1,(clientY-rect.top)/rect.height));
 const targetTime=ratio*duration;
 if(!Number.isFinite(targetTime))return false;
 try{audioEl.currentTime=targetTime}catch(error){console.warn("Audio seek failed",error);return false}
 updatePlaybackCursor();syncTranscriptToPlayback();return true;
}
function updatePlaybackCursor(){
 const duration=getPlaybackDuration();
 const ratio=duration>0?Math.max(0,Math.min(1,audioEl.currentTime/duration)):0;
 const percent=ratio*100,toggle=$("#playToggle"),rail=$("#playRail");
 toggle.style.top=percent+"%";toggle.style.transform="translate(-50%,-50%)";
 toggle.textContent=audioEl.paused?"▶":"Ⅱ";toggle.setAttribute("aria-label",audioEl.paused?"再生":"一時停止");
 $("#playProgress").style.height=percent+"%";
 rail.setAttribute("aria-valuenow",String(Math.round(percent)));
 rail.setAttribute("aria-valuetext",fmt(audioEl.currentTime*1000)+" / "+fmt(duration*1000));
 const buffered=[];if(duration>0){for(let i=0;i<audioEl.buffered.length;i++){const start=Math.max(0,audioEl.buffered.start(i)/duration*100),end=Math.min(100,audioEl.buffered.end(i)/duration*100);if(end>start)buffered.push(start.toFixed(2)+"% "+end.toFixed(2)+"%")}}rail.style.setProperty("--buffered-ranges",buffered.length?"#c8c8c8 "+buffered.join(", #c8c8c8 "):"transparent");
}
let playbackFrame=0;
function animatePlaybackCursor(){updatePlaybackCursor();if(!audioEl.paused&&!audioEl.ended)playbackFrame=requestAnimationFrame(animatePlaybackCursor);else playbackFrame=0}
let playbackFocusedSegmentKey="";
function syncTranscriptToPlayback(){
 const time=audioEl.currentTime,segment=transcriptSegments.find(item=>time>=item.t0&&time<=item.t1);
 if(!segment)return;
 const key=segment.t0+":"+segment.t1+":"+segment.start+":"+segment.end;
 if(key===playbackFocusedSegmentKey)return;
 playbackFocusedSegmentKey=key;
 try{
  textArea.focus({preventScroll:true});
  textArea.setSelectionRange(segment.start,segment.end);
  textArea.scrollIntoView({block:"nearest",behavior:"smooth"});
 }catch(error){console.warn("Transcript playback focus failed",error)}
}
async function togglePlayback(){
 if(!audioBlob){status("再生できる録音音声がありません");return}
 if(audioEl.paused){try{await audioEl.play()}catch(error){status("音声を再生できません: "+(error.message||"再生エラー"));console.error("Audio playback failed",error)}}
 else audioEl.pause();
}
const playbackRail=$("#playRail"),playToggle=$("#playToggle");
let railPointerId=null,railPointerStartY=0,railPointerMoved=false,railPointerOnHandle=false;
playbackRail.addEventListener("pointerdown",event=>{
 if(event.pointerType==="mouse"&&event.button!==0)return;
 if(!audioBlob)return;
 railPointerId=event.pointerId;railPointerStartY=event.clientY;railPointerMoved=false;
 railPointerOnHandle=event.target===playToggle||playToggle.contains(event.target);
 try{event.currentTarget.setPointerCapture(event.pointerId)}catch(error){console.warn("Seek pointer capture unavailable",error)}
 event.preventDefault();seekFromPointerY(event.clientY);
});
playbackRail.addEventListener("pointermove",event=>{
 if(railPointerId!==event.pointerId)return;
 if(Math.abs(event.clientY-railPointerStartY)>=3)railPointerMoved=true;
 seekFromPointerY(event.clientY);
});
function finishRailPointer(event){
 if(railPointerId!==event.pointerId)return;
 const shouldToggle=railPointerOnHandle&&!railPointerMoved;
 railPointerId=null;railPointerOnHandle=false;
 if(shouldToggle)togglePlayback();
}
playbackRail.addEventListener("pointerup",finishRailPointer);
playbackRail.addEventListener("pointercancel",event=>{if(railPointerId===event.pointerId){railPointerId=null;railPointerOnHandle=false}});
playbackRail.addEventListener("lostpointercapture",()=>{railPointerId=null;railPointerOnHandle=false});
playToggle.addEventListener("click",event=>{event.preventDefault();if(event.detail===0)togglePlayback()});
playbackRail.addEventListener("keydown",event=>{
 if(!audioBlob||getPlaybackDuration()<=0)return;
 const duration=getPlaybackDuration();let next=audioEl.currentTime;
 if(event.key==="ArrowUp"||event.key==="ArrowRight")next+=Math.max(1,duration/100);
 else if(event.key==="ArrowDown"||event.key==="ArrowLeft")next-=Math.max(1,duration/100);
 else if(event.key==="Home")next=0;
 else if(event.key==="End")next=duration;
 else return;
 event.preventDefault();audioEl.currentTime=Math.max(0,Math.min(duration,next));updatePlaybackCursor();syncTranscriptToPlayback();
});
audioEl.addEventListener("loadedmetadata",()=>{audioEl.currentTime=0;updatePlaybackCursor()});
audioEl.addEventListener("durationchange",updatePlaybackCursor);
audioEl.addEventListener("seeking",updatePlaybackCursor);
audioEl.addEventListener("seeked",updatePlaybackCursor);
audioEl.addEventListener("timeupdate",()=>{updatePlaybackCursor();syncTranscriptToPlayback()});
audioEl.addEventListener("play",()=>{$("#playToggle").textContent="Ⅱ";$("#playToggle").setAttribute("aria-label","一時停止");if(!playbackFrame)playbackFrame=requestAnimationFrame(animatePlaybackCursor)});
audioEl.addEventListener("pause",()=>{$("#playToggle").textContent="▶";$("#playToggle").setAttribute("aria-label","再生");if(playbackFrame)cancelAnimationFrame(playbackFrame);playbackFrame=0;updatePlaybackCursor()});
audioEl.addEventListener("canplay",updatePlaybackCursor);
audioEl.addEventListener("progress",updatePlaybackCursor);
audioEl.addEventListener("loadeddata",updatePlaybackCursor);
audioEl.addEventListener("durationchange",updatePlaybackCursor);
audioEl.addEventListener("error",()=>{if(audioBlob)status("録音音声を読み込めませんでした")});
audioEl.addEventListener("ended",()=>{$("#playToggle").textContent="▶";if(playbackFrame)cancelAnimationFrame(playbackFrame);playbackFrame=0;updatePlaybackCursor();textArea.setSelectionRange(0,0)});
textArea.addEventListener("input",()=>{if(!internalTranscriptUpdate){if(transcriptTypingTimer)clearTimeout(transcriptTypingTimer);transcriptTypingTimer=0;transcriptQueue.length=0;transcriptLogicalLength=textArea.value.length;transcriptSegments=[];localStorage.removeItem("vnnTranscriptSegments")}fitTranscriptArea();persistTranscript()});
$("#dictionaryAdd").addEventListener("click",()=>{const value=$("#dictionaryInput").value.trim();if(!value)return;if(!settings.dictionary.includes(value))settings.dictionary.push(value);$("#dictionaryInput").value="";persistSettings();renderSettingsListsOnce()});
$("#dictionaryInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#dictionaryAdd").click()});
function renderSpeakerProfiles(){const root=$("#speakerList");if(!root)return;root.innerHTML="";const select=$("#speakerAssignSelect");if(select){select.innerHTML="";const first=document.createElement("option");first.value="";first.textContent="割当先を選択";select.append(first)}speakerProfiles.forEach(p=>{const row=document.createElement("div"),label=document.createElement("span"),rename=document.createElement("button"),remove=document.createElement("button");row.className="list-item";label.textContent=p.name+" ("+p.id+") · "+p.samples+" サンプル";if(select){const option=document.createElement("option");option.value=p.id;option.textContent=p.name+" ("+p.id+")";select.append(option)}rename.textContent="名称変更";rename.onclick=()=>{const n=prompt("新しい話者名",p.name);if(n&&n.trim())asrWorker?.postMessage({type:"speaker-rename",id:p.id,name:n.trim()})};remove.textContent="削除";remove.onclick=()=>{if(confirm(p.name+" の声紋を削除しますか？"))asrWorker?.postMessage({type:"speaker-delete",id:p.id})};row.append(label,rename,remove);root.append(row)})}
$("#speakerAdd").addEventListener("click",()=>{const name=$("#speakerInput").value.trim();if(!name)return;if(!asrReady||enrollmentSamples<8000){status("対象者が単独で話している状態で2秒以上録音してから登録してください");return}const samples=new Float32Array(enrollmentSamples);let offset=0;for(const part of enrollmentChunks){samples.set(part,offset);offset+=part.length}const id="person-"+Date.now();asrWorker.postMessage({type:"speaker-enroll",id,name,samples},[samples.buffer]);$("#speakerInput").value="";status("声紋を登録しています…")});
$("#speakerInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#speakerAdd").click()});
$("#speakerSave").addEventListener("click",()=>asrWorker?.postMessage({type:"speaker-save"}));
$("#speakerRelabel").addEventListener("click",()=>asrWorker?.postMessage({type:"speaker-relabel"}));
$("#speakerAssignBtn").addEventListener("click",()=>{const id=$("#speakerAssignSelect").value;const start=textArea.selectionStart,end=textArea.selectionEnd;if(!id){status("割当先の話者を選択してください");return}if(start===end){status("文字起こし欄で対象の発話を選択してください");return}const seg=transcriptSegments.find(x=>start<x.end&&end>x.start);if(!seg){status("選択範囲に対応する発話区間がありません");return}const profile=speakerProfiles.find(x=>x.id===id);asrWorker?.postMessage({type:"speaker-label",t0:seg.t0,t1:seg.t1,id,name:profile?.name||""});status("話者ラベルを更新しています…")});
$("#speakerInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#speakerAdd").click()});
$("#shareBtn").addEventListener("click",async()=>{
 const transcript=textArea.value.trim(),files=[];
 if(audioBlob&&settings.saveAudio&&window.File)files.push(new File([audioBlob],"recording.webm",{type:audioBlob.type||"audio/webm"}));
 if(!transcript&&!files.length){status("共有する内容がありません");return}
 const shareTitle="文字起こしアプリ v"+appVersion.textContent;
 try{
  if(typeof navigator.share==="function"){
   const base={title:shareTitle,text:transcript||undefined};
   if(files.length&&(typeof navigator.canShare!=="function"||navigator.canShare({files}))){
    try{await navigator.share({...base,files});status("共有しました");return}
    catch(error){if(error.name==="AbortError")return;console.warn("File share failed; retrying text-only share",error)}
   }
   if(transcript){await navigator.share(base);status("テキストを共有しました");return}
  }
  if(transcript&&navigator.clipboard&&typeof navigator.clipboard.writeText==="function"){await navigator.clipboard.writeText(transcript);status("テキストをコピーしました");return}
  if(transcript){const blob=new Blob([transcript],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),link=document.createElement("a");link.href=url;link.download="transcription.txt";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status("共有機能が使えないためテキストを保存しました");return}
  if(files.length){const url=URL.createObjectURL(audioBlob),link=document.createElement("a");link.href=url;link.download="recording.webm";link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);status("共有機能が使えないため音声を保存しました")}
 }catch(error){if(error.name!=="AbortError"){console.error("Share failed",error);status("共有できませんでした: "+(error.message||"共有エラー"))}}
});
