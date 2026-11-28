/* Audio input adapters for vn.n.
 * start() resolves to an audio-only MediaStream. stop() releases every
 * track owned by the adapter. Native adapters can implement this contract.
 */
(function (root) {
  "use strict";
  class AudioSource {
    constructor() {
      this.captureStream = null;
      this.audioStream = null;
      this.onEnded = null;
      this.stopping = false;
    }
    watchTracks(stream) {
      for (const track of stream.getTracks()) {
        track.addEventListener("ended", () => {
          if (!this.stopping && typeof this.onEnded === "function") this.onEnded();
        }, { once: true });
      }
    }
    async stop() {
      this.stopping = true;
      if (this.captureStream) {
        for (const track of this.captureStream.getTracks()) {
          try { track.stop(); } catch (_) {}
        }
      }
      this.captureStream = null;
      this.audioStream = null;
    }
  }
  class MicrophoneAudioSource extends AudioSource {
    async start() {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("マイク入力に対応していません");
      this.captureStream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true }
      });
      this.audioStream = this.captureStream;
      this.watchTracks(this.captureStream);
      return this.audioStream;
    }
  }
  class BrowserTabAudioSource extends AudioSource {
    async start() {
      if (!navigator.mediaDevices?.getDisplayMedia) throw new Error("このブラウザはタブ音声共有に対応していません");
      // Must be invoked directly from the user's explicit start action.
      this.captureStream = await navigator.mediaDevices.getDisplayMedia({
        video: { displaySurface: "browser" },
        audio: true,
        selfBrowserSurface: "exclude",
        systemAudio: "exclude",
        surfaceSwitching: "include"
      });
      const audioTracks = this.captureStream.getAudioTracks();
      if (!audioTracks.length) {
        await this.stop();
        throw new Error("共有対象の音声がありません。共有画面でタブ音声を有効にしてください");
      }
      // Keep the display track alive for the capture session, but never pass
      // it to MediaRecorder or the ASR graph.
      this.audioStream = new MediaStream(audioTracks);
      this.watchTracks(this.captureStream);
      return this.audioStream;
    }
  }
  function isSupported(mode) {
    return mode === "system"
      ? !!navigator.mediaDevices?.getDisplayMedia
      : !!navigator.mediaDevices?.getUserMedia;
  }
  function create(mode) {
    if (mode === "system") return new BrowserTabAudioSource();
    if (mode === "mic") return new MicrophoneAudioSource();
    throw new TypeError("Unknown audio input mode: " + mode);
  }
  root.VnnAudioSources = Object.freeze({ AudioSource, BrowserTabAudioSource, MicrophoneAudioSource, create, isSupported });
})(window);
