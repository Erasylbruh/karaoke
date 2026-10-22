/**
 * Procedural Web Audio Synth & Backing Track Generator
 * Provides zero-dependency, guaranteed-to-work backing tracks for karaoke playback & video export.
 */

export class BackingTrackSynthesizer {
  private ctx: AudioContext | null = null;
  private isPlaying = false;
  private currentPreset: string = 'synthwave';
  private loopInterval: number | null = null;
  private startTime = 0;
  private masterGain: GainNode | null = null;
  private destNode: MediaStreamAudioDestinationNode | null = null;

  private initContext() {
    if (!this.ctx) {
      const AudioContextClass = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioContextClass();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.setValueAtTime(0.4, this.ctx.currentTime);
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  public getMediaStreamDestination(): MediaStreamAudioDestinationNode | null {
    this.initContext();
    if (this.ctx && !this.destNode) {
      this.destNode = this.ctx.createMediaStreamDestination();
      if (this.masterGain) {
        this.masterGain.connect(this.destNode);
      }
    }
    return this.destNode;
  }

  public setVolume(vol: number) {
    if (this.masterGain && this.ctx) {
      this.masterGain.gain.setValueAtTime(Math.max(0, Math.min(1, vol)), this.ctx.currentTime);
    }
  }

  public playPreset(preset: string = 'synthwave', startOffsetSec = 0) {
    this.initContext();
    if (!this.ctx || !this.masterGain) return;

    this.stop();
    this.isPlaying = true;
    this.currentPreset = preset;
    this.startTime = this.ctx.currentTime - startOffsetSec;

    // Start beat engine
    this.scheduleNotes();
    this.loopInterval = window.setInterval(() => {
      if (this.isPlaying) {
        this.scheduleNotes();
      }
    }, 2000);
  }

  private scheduleNotes() {
    if (!this.ctx || !this.masterGain || !this.isPlaying) return;

    const now = this.ctx.currentTime;
    const bpm = this.currentPreset === 'lofi' ? 82 : this.currentPreset === 'pop' ? 120 : 108;
    const beatTime = 60 / bpm;

    // Schedule 8 beats ahead
    for (let i = 0; i < 8; i++) {
      const t = now + i * beatTime;

      // Kick on 1 and 3
      if (i % 2 === 0) {
        this.playKick(t);
      }

      // Snare / Clap on 2 and 4
      if (i % 2 === 1) {
        this.playSnare(t);
      }

      // Hi-hat on every 8th note
      this.playHiHat(t);
      this.playHiHat(t + beatTime / 2);

      // Bassline note
      const baseFreqs = this.currentPreset === 'synthwave' 
        ? [65.41, 73.42, 82.41, 55.0] // C2, D2, E2, A1
        : [55.0, 65.41, 73.42, 49.0];
      const freq = baseFreqs[i % baseFreqs.length];
      this.playBass(t, freq, beatTime * 0.9);

      // Synth chord pad
      if (i % 4 === 0) {
        const chordRoots = [261.63, 220.0, 174.61, 196.0]; // C4, A3, F3, G3
        const root = chordRoots[(Math.floor(i / 4)) % chordRoots.length];
        this.playPad(t, root, beatTime * 4);
      }
    }
  }

  private playKick(t: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();

    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(0.01, t + 0.35);

    gain.gain.setValueAtTime(0.7, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.35);
  }

  private playSnare(t: number) {
    if (!this.ctx || !this.masterGain) return;
    
    // Noise buffer
    const bufferSize = this.ctx.sampleRate * 0.15;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = this.ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.value = 1000;

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.3, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    noise.start(t);
    noise.stop(t + 0.15);
  }

  private playHiHat(t: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';
    osc.frequency.setValueAtTime(8000, t);

    gain.gain.setValueAtTime(0.08, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.04);

    osc.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + 0.04);
  }

  private playBass(t: number, freq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    const filter = this.ctx.createBiquadFilter();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(freq, t);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(350, t);

    gain.gain.setValueAtTime(0.4, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterGain);

    osc.start(t);
    osc.stop(t + duration);
  }

  private playPad(t: number, rootFreq: number, duration: number) {
    if (!this.ctx || !this.masterGain) return;
    
    // Play a minor triad
    const freqs = [rootFreq, rootFreq * 1.189, rootFreq * 1.498];
    freqs.forEach((f) => {
      if (!this.ctx || !this.masterGain) return;
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();
      const filter = this.ctx.createBiquadFilter();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(f, t);

      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(800, t);

      gain.gain.setValueAtTime(0.001, t);
      gain.gain.linearRampToValueAtTime(0.12, t + 0.8);
      gain.gain.exponentialRampToValueAtTime(0.001, t + duration);

      osc.connect(filter);
      filter.connect(gain);
      gain.connect(this.masterGain);

      osc.start(t);
      osc.stop(t + duration);
    });
  }

  public stop() {
    this.isPlaying = false;
    if (this.loopInterval) {
      clearInterval(this.loopInterval);
      this.loopInterval = null;
    }
  }

  public getCurrentTime(): number {
    if (!this.ctx || !this.isPlaying) return 0;
    return Math.max(0, this.ctx.currentTime - this.startTime);
  }
}

// Global singleton instance for easy usage
export const synthPlayer = typeof window !== 'undefined' ? new BackingTrackSynthesizer() : null;
