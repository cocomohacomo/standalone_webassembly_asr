const $=s=>document.querySelector(s);
const recordBtn=$("#recordBtn"),stopBtn=$("#stopBtn"),timerEl=$("#timer"),statusText=$("#statusText"),dot=$("#recordDot"),textArea=$("#text"),audioEl=$("#audio"),historyEl=$("#history");
const installBtn=$("#installBtn");
let recorder=null, chunks=[], audioBlob=null, audioUrl=null, startedAt=0, timerId=null, deferredInstallPrompt=null;
function fmt(ms){const sec=Math.floor(ms/1000);return String(Math.floor(sec/60)).padStart(2,"0")+":"+String(sec%60).padStart(2,"0")}
function status(s,active=false){statusText.textContent=s;dot.classList.toggle("active",active)}
function setTimer(){timerEl.textContent=fmt(Date.now()-startedAt)}
function cleanUrl(){if(audioUrl){URL.revokeObjectURL(audioUrl);audioUrl=null}}
recordBtn.addEventListener("click",async()=>{
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){status("このブラウザでは録音に対応していません");return}
 try{
  const stream=await navigator.mediaDevices.getUserMedia({audio:true});
  chunks=[];audioBlob=null;cleanUrl();audioEl.classList.add("hide");audioEl.removeAttribute("src");
  recorder=new MediaRecorder(stream);recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data)};
  recorder.onstop=()=>{audioBlob=new Blob(chunks,{type:recorder.mimeType||"audio/webm"});audioUrl=URL.createObjectURL(audioBlob);audioEl.src=audioUrl;audioEl.classList.remove("hide");$("#downloadAudioBtn").disabled=false;stream.getTracks().forEach(t=>t.stop());status("録音完了。再生または保存できます。")};
  recorder.start();startedAt=Date.now();setTimer();timerId=setInterval(setTimer,250);recordBtn.disabled=true;stopBtn.disabled=false;status("録音中…",true);
 }catch(err){status(err.name==="NotAllowedError"?"マイクの使用が許可されていません":"録音を開始できません");console.error(err)}
});
stopBtn.addEventListener("click",()=>{if(recorder?.state==="recording"){recorder.stop();clearInterval(timerId);recordBtn.disabled=false;stopBtn.disabled=true}});
$("#downloadAudioBtn").addEventListener("click",()=>{if(!audioBlob)return;const a=document.createElement("a");a.href=audioUrl;a.download="voice-memo-"+new Date().toISOString().replace(/[:.]/g,"-")+".webm";a.click()});
$("#copyBtn").addEventListener("click",async()=>{try{await navigator.clipboard.writeText(textArea.value);status("テキストをコピーしました")}catch{textArea.select();status("テキストを選択しました。コピーしてください")}});
$("#exportBtn").addEventListener("click",()=>{const blob=new Blob([textArea.value],{type:"text/plain;charset=utf-8"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download="transcription.txt";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000)});
function loadHistory(){let list=[];try{list=JSON.parse(localStorage.getItem("voiceMemoHistory")||"[]")}catch{};historyEl.innerHTML="";if(!list.length){historyEl.innerHTML='<p class="hint">保存した履歴はここに表示されます。</p>';return}list.slice(0,30).forEach(item=>{const row=document.createElement("div");row.className="history-item";const label=document.createElement("span");label.textContent=item.date;const open=document.createElement("button");open.textContent="開く";open.onclick=()=>textArea.value=item.text;row.append(label,open);historyEl.append(row)})}
$("#saveBtn").addEventListener("click",()=>{const value=textArea.value.trim();if(!value){status("保存するテキストがありません");return}let list=[];try{list=JSON.parse(localStorage.getItem("voiceMemoHistory")||"[]")}catch{};list.unshift({date:new Date().toLocaleString("ja-JP"),text:value});localStorage.setItem("voiceMemoHistory",JSON.stringify(list.slice(0,30)));loadHistory();status("履歴に保存しました")});
$("#clearBtn").addEventListener("click",()=>{textArea.value="";audioEl.pause();audioEl.classList.add("hide");audioBlob=null;cleanUrl();$("#downloadAudioBtn").disabled=true;timerEl.textContent="00:00";status("待機中")});
loadHistory();
$("#connection").textContent=navigator.onLine?"オンライン":"オフライン";
addEventListener("online",()=>$("#connection").textContent="オンライン");addEventListener("offline",()=>$("#connection").textContent="オフライン");
window.addEventListener("beforeinstallprompt",event=>{event.preventDefault();deferredInstallPrompt=event;installBtn.hidden=false});
installBtn.addEventListener("click",async()=>{if(!deferredInstallPrompt)return;deferredInstallPrompt.prompt();await deferredInstallPrompt.userChoice;deferredInstallPrompt=null;installBtn.hidden=true});
window.addEventListener("appinstalled",()=>{deferredInstallPrompt=null;installBtn.hidden=true;status("アプリをインストールしました")});
if("serviceWorker" in navigator && location.protocol!=="file:"){navigator.serviceWorker.register("./sw.js").catch(error=>{console.warn("Service Worker registration failed",error);status("オフライン機能の初期化に失敗しました")})}
