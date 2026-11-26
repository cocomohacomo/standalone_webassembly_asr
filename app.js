const $=s=>document.querySelector(s);
const recordBtn=$("#recordBtn"),stopBtn=$("#stopBtn"),timerEl=$("#timer"),statusText=$("#statusText"),dot=$("#recordDot"),textArea=$("#text"),audioEl=$("#audio"),historyEl=$("#history");
const installBtn=$("#installBtn");
const settingsDefaults={saveAudio:true,timestamps:false,speakerDisplay:false,vadSensitivity:"0.25",minSilence:"0.5",maxPaths:"8",dictionary:[],speakers:[]};
let settings={...settingsDefaults};
try{settings={...settingsDefaults,...JSON.parse(localStorage.getItem("vnnSettings")||"{}")}}catch{}
function persistSettings(){localStorage.setItem("vnnSettings",JSON.stringify(settings))}
function renderSettingsListsOnce(){
 const render=(id,items,key)=>{const root=$(id);root.innerHTML="";items.forEach((value,i)=>{const row=document.createElement("div");row.className="list-item";const span=document.createElement("span");span.textContent=value;const remove=document.createElement("button");remove.textContent="削除";remove.onclick=()=>{settings[key].splice(i,1);persistSettings();renderSettingsListsOnce()};row.append(span,remove);root.append(row)})};
 render("#dictionaryList",settings.dictionary,"dictionary");render("#speakerList",settings.speakers,"speakers");
}
function openSettings(){$("#saveAudioSetting").checked=!!settings.saveAudio;$("#timestampSetting").checked=!!settings.timestamps;$("#speakerDisplaySetting").checked=!!settings.speakerDisplay;$("#vadSensitivity").value=settings.vadSensitivity;$("#minSilence").value=settings.minSilence;$("#maxPaths").value=settings.maxPaths;renderSettingsListsOnce();$("#settingsPanel").classList.add("open")}
function closeSettings(){$("#settingsPanel").classList.remove("open")}

let recorder=null,chunks=[],audioBlob=null,audioUrl=null,startedAt=0,timerId=null,deferredInstallPrompt=null;
let asrWorker=null,audioContext=null,mediaStream=null,sourceNode=null,workletNode=null,asrReady=false,asrStarting=null;
const MODEL_REV="13b4596";
const MODEL_BASE="https://huggingface.co/DeL-TaiseiOzaki/sherpa-onnx-zipformer-ja-reazonspeech-2024-08-01/resolve/"+MODEL_REV+"/";
const MODEL_FILES=[
 // Fetch small required metadata first so a bad model revision fails before large ONNX downloads.
 {url:MODEL_BASE+"tokens.txt",path:"ja/tokens.txt"},
 {url:"https://huggingface.co/daxpatel235/silero-vad/resolve/main/silero_vad.onnx",path:"silero_vad.onnx",sha256:"9e2449e1087496d8d4caba907f23e0bd3f78d91fa552479bb9c23ac09cbb1fd6"},
 {url:MODEL_BASE+"encoder-epoch-99-avg-1.int8.onnx",path:"ja/encoder-epoch-99-avg-1.int8.onnx"},
 {url:MODEL_BASE+"decoder-epoch-99-avg-1.onnx",path:"ja/decoder-epoch-99-avg-1.onnx"},
 {url:MODEL_BASE+"joiner-epoch-99-avg-1.onnx",path:"ja/joiner-epoch-99-avg-1.onnx"}
];
function fmt(ms){const sec=Math.floor(ms/1000);return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")}
function status(s,active=false){statusText.textContent=s;dot.classList.toggle("active",active)}
function setTimer(){timerEl.textContent=fmt(Date.now()-startedAt)}
function cleanUrl(){if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null}}
function workerMessage({data}){
 if(data.type==="log")return;
 if(data.type==="model-file-ready"){status("日本語モデルを準備中… "+data.path.split("/").pop());return}
 if(data.type==="ready"){asrReady=true;status("日本語音声認識の準備完了");return}
 if(data.type==="asr-event"){
  const event=data.event||{};
  if(event.text&&event.text.trim()){
   if(event.type===2){const stamp=settings.timestamps?"["+new Date().toLocaleTimeString("ja-JP",{hour:"2-digit",minute:"2-digit",second:"2-digit"})+"] ":"";textArea.value+=(textArea.value?"\n":"")+stamp+event.text.trim()}
   else if(event.type===1){status("認識中… "+event.text.trim(),true)}
  }
  return;
 }
 if(data.type==="error"){status("ASRエラー: "+data.message);console.error(data.message);return}
 if(data.type==="accepted"||data.type==="flushed"||data.type==="closed")return;
}
async function ensureAsr(){
 if(asrReady)return;
 if(asrStarting)return asrStarting;
 asrStarting=(async()=>{
  if(!window.Worker||!window.AudioWorkletNode||!window.AudioContext)throw new Error("このブラウザはAudioWorklet/Workerに対応していません");
  asrWorker=new Worker("./web/wasm/asr-worker.js");
  asrWorker.onmessage=workerMessage;
  asrWorker.onerror=e=>{const detail=e.message||"unknown worker error";status("Workerエラー: "+detail);console.error("ASR_WORKER_ERROR",detail,e.filename||"",e.lineno||0)};
  const ready=new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>reject(new Error("WASM/モデル初期化がタイムアウトしました")),15*60*1000);
   const listener=({data})=>{
    if(data.type==="ready"){clearTimeout(timeout);asrWorker.removeEventListener("message",listener);resolve()}
    if(data.type==="error"){clearTimeout(timeout);asrWorker.removeEventListener("message",listener);reject(new Error(data.message))}
   };
   asrWorker.addEventListener("message",listener);
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
 try{await asrStarting}finally{asrStarting=null}
}
async function startLivePcm(stream){
 if(!audioContext)audioContext=new AudioContext({latencyHint:"interactive"});
 if(audioContext.state==="suspended")await audioContext.resume();
 await audioContext.audioWorklet.addModule("./web/wasm/pcm-worklet.js");
 sourceNode=audioContext.createMediaStreamSource(stream);
 workletNode=new AudioWorkletNode(audioContext,"pcm-16k-processor",{numberOfInputs:1,numberOfOutputs:1,channelCount:1});
 workletNode.port.onmessage=({data})=>{
  if(data.type==="pcm"&&asrReady)asrWorker.postMessage({type:"audio",samples:data.samples},[data.samples.buffer]);
 };
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
recordBtn.addEventListener("click",async()=>{
 if(recorder?.state==="recording"){stopBtn.click();return}
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status("このブラウザでは録音に対応していません");return}
 recordBtn.disabled=true;recordBtn.textContent="…";if(!asrReady&&!confirm("日本語音声認識モデルが未準備です。初回は約155MBのモデルをダウンロードします。続行しますか？")){recordBtn.disabled=false;recordBtn.textContent="●";return}status("ASRと日本語モデルを準備しています…",true);
 try{
  mediaStream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:true}});
  audioContext=new AudioContext({latencyHint:"interactive"});
  await audioContext.resume();
  await ensureAsr();
  await startLivePcm(mediaStream);
  chunks=[];audioBlob=null;cleanUrl();audioEl.classList.add("hide");audioEl.removeAttribute("src");
  recorder=new MediaRecorder(mediaStream);recorder.ondataavailable=e=>{if(settings.saveAudio&&e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{audioBlob=settings.saveAudio&&chunks.length?new Blob(chunks,{type:recorder.mimeType||"audio/webm"}):null;if(audioBlob){audioUrl=URL.createObjectURL(audioBlob);audioEl.src=audioUrl;audioEl.classList.add("hide");$("#downloadAudioBtn").disabled=false;$("#playbackRail").style.display="flex"}else{audioEl.classList.add("hide");$("#downloadAudioBtn").disabled=true;$("#playbackRail").style.display="none"}mediaStream?.getTracks().forEach(t=>t.stop());mediaStream=null;status("録音・認識を終了しました");recordBtn.textContent="●";recordBtn.disabled=false};
  recorder.start(500);startedAt=Date.now();setTimer();timerId=setInterval(setTimer,250);recordBtn.textContent="■";recordBtn.disabled=false;stopBtn.disabled=false;status("録音・日本語認識中…",true);
 }catch(err){status(err.name==="NotAllowedError"?"マイクの使用が許可されていません":"ASR初期化エラー: "+(err.message||"認識を開始できません"));console.error(err);recordBtn.textContent="開始";recordBtn.disabled=false;mediaStream?.getTracks().forEach(t=>t.stop());mediaStream=null;try{if(audioContext&&audioContext.state!=="closed")await audioContext.close()}catch{}audioContext=null}
});
stopBtn.addEventListener("click",async()=>{
 if(recorder?.state==="recording"){stopBtn.disabled=true;await stopLivePcm();recorder.stop();clearInterval(timerId);recordBtn.textContent="●";recordBtn.disabled=false}
});
$("#downloadAudioBtn").addEventListener("click",()=>{if(!audioBlob)return;const a=document.createElement("a");a.href=audioUrl;a.download="voice-memo-"+new Date().toISOString().replace(/[:.]/g,"-")+".webm";a.click()});

$("#exportBtn").addEventListener("click",()=>{const blob=new Blob([textArea.value],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="transcription.txt";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
function loadHistory(){let list=[];try{list=JSON.parse(localStorage.getItem("voiceMemoHistory")||"[]")}catch{};historyEl.innerHTML="";if(!list.length){historyEl.innerHTML='<p class="hint">保存した履歴はここに表示されます。</p>';return}list.slice(0,30).forEach(item=>{const row=document.createElement("div");row.className="history-item";const label=document.createElement("span");label.textContent=item.date;const open=document.createElement("button");open.textContent="開く";open.onclick=()=>textArea.value=item.text;row.append(label,open);historyEl.append(row)})}
$("#saveBtn").addEventListener("click",()=>{const value=textArea.value.trim();if(!value){status("保存するテキストがありません");return}let list=[];try{list=JSON.parse(localStorage.getItem("voiceMemoHistory")||"[]")}catch{};list.unshift({date:new Date().toLocaleString("ja-JP"),text:value});localStorage.setItem("voiceMemoHistory",JSON.stringify(list.slice(0,30)));loadHistory();status("履歴に保存しました")});
$("#clearBtn").addEventListener("click",()=>{if(!confirm("文字起こしテキストと録音データをクリアしますか？"))return;textArea.value="";audioEl.pause();audioEl.classList.add("hide");audioBlob=null;cleanUrl();$("#downloadAudioBtn").disabled=true;timerEl.textContent="00:00";$("#playbackRail").style.display="none";status("待機中")});
loadHistory();
$("#connection").textContent=navigator.onLine?"オンライン":"オフライン";
addEventListener("online",()=>$("#connection").textContent="オンライン");addEventListener("offline",()=>$("#connection").textContent="オフライン");
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;installBtn.hidden=false});
installBtn.addEventListener("click",async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;installBtn.hidden=true});
window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;installBtn.hidden=true;status("アプリをインストールしました")});
if("serviceWorker" in navigator&&location.protocol!=="file:"){navigator.serviceWorker.register("./sw.js").catch(error=>{console.warn("Service Worker registration failed",error);status("オフライン機能の初期化に失敗しました")})}

$("#settingsBtn").addEventListener("click",openSettings);$("#settingsClose").addEventListener("click",closeSettings);$("#settingsPanel").addEventListener("click",e=>{if(e.target.id==="settingsPanel")closeSettings()});
$("#saveAudioSetting").addEventListener("change",e=>{settings.saveAudio=e.target.checked;persistSettings();if(!settings.saveAudio){audioBlob=null;cleanUrl();audioEl.classList.add("hide");$("#downloadAudioBtn").disabled=true}});
$("#timestampSetting").addEventListener("change",e=>{settings.timestamps=e.target.checked;persistSettings()});
$("#speakerDisplaySetting").addEventListener("change",e=>{settings.speakerDisplay=e.target.checked;persistSettings()});\n["vadSensitivity","minSilence","maxPaths"].forEach(id=>$("#"+id).addEventListener("change",e=>{settings[id]=e.target.value;persistSettings();status("認識パラメータは次回起動時に適用されます")}));\n$("#playToggle").addEventListener("click",()=>{if(!audioBlob)return;if(audioEl.paused){audioEl.play();$("#playToggle").textContent="Ⅱ"}else{audioEl.pause();$("#playToggle").textContent="▶"}});audioEl.addEventListener("timeupdate",()=>{if(audioEl.duration>0)$("#playProgress").style.height=(audioEl.currentTime/audioEl.duration*100)+"%"});audioEl.addEventListener("ended",()=>$("#playToggle").textContent="▶");
$("#dictionaryAdd").addEventListener("click",()=>{const value=$("#dictionaryInput").value.trim();if(!value)return;if(!settings.dictionary.includes(value))settings.dictionary.push(value);$("#dictionaryInput").value="";persistSettings();renderSettingsListsOnce()});
$("#dictionaryInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#dictionaryAdd").click()});
$("#speakerAdd").addEventListener("click",()=>{const value=$("#speakerInput").value.trim();if(!value)return;if(!settings.speakers.includes(value))settings.speakers.push(value);$("#speakerInput").value="";persistSettings();renderSettingsListsOnce()});
$("#speakerInput").addEventListener("keydown",e=>{if(e.key==="Enter")$("#speakerAdd").click()});
$("#shareBtn").addEventListener("click",async()=>{
 const files=[];
 if(audioBlob&&settings.saveAudio&&window.File)files.push(new File([audioBlob],"transcription-audio.webm",{type:audioBlob.type||"audio/webm"}));
 const transcript=textArea.value.trim();
 if(!transcript&&!files.length){status("共有する内容がありません");return}
 try{
  if(navigator.share){
   const payload={title:"文字起こしアプリ vn.n",text:transcript||undefined,files:files.length?files:undefined};
   if(!files.length||!navigator.canShare||navigator.canShare({files})){
    await navigator.share(payload);
   }else if(transcript){
    await navigator.share({title:"文字起こしアプリ vn.n",text:transcript});
   }else{
    status("この端末では音声ファイルを共有できません");
   }
  }else if(transcript){
   await navigator.clipboard.writeText(transcript);
   status("共有機能が未対応のためテキストをコピーしました");
  }else{
   status("共有機能がこのブラウザでは利用できません");
  }
 }catch(e){if(e.name!=="AbortError")status("共有できませんでした")}
});
