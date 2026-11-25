// Converts browser input to mono 16 kHz Float32 PCM and emits 100 ms blocks.
class Pcm16kProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.ratio = sampleRate / 16000;
    this.phase = 0;
    this.previous = 0;
    this.hasPrevious = false;
    this.block = new Float32Array(1600);
    this.used = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels || !channels.length || !channels[0].length) return true;
    const length = channels[0].length;
    for (let i = 0; i < length; i++) {
      let mono = 0;
      for (let c = 0; c < channels.length; c++) mono += channels[c][i] || 0;
      mono /= channels.length;
      if (!this.hasPrevious) {
        this.previous = mono;
        this.hasPrevious = true;
        continue;
      }
      while (this.phase < 1) {
        const sample = this.previous + (mono - this.previous) * this.phase;
        this.block[this.used++] = Math.max(-1, Math.min(1, sample));
        if (this.used === this.block.length) {
          const chunk = this.block;
          this.block = new Float32Array(1600);
          this.used = 0;
          this.port.postMessage({ type: "pcm", samples: chunk }, [chunk.buffer]);
        }
        this.phase += this.ratio;
      }
      this.phase -= 1;
      this.previous = mono;
    }
    return true;
  }
}
registerProcessor("pcm-16k-processor", Pcm16kProcessor);
