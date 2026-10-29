/**
 * All sound is generated with the Web Audio API, so there are no audio files to load.
 * Every ghost adds one soft note to a looping pad: the more ghosts, the fuller the music.
 */

const SCALE = [0, 3, 5, 7, 10]; // minor pentatonic, in semitones above the root
const ROOT_HZ = 110; // A2
const MAX_VOICES = 14;

interface Voice {
  osc: OscillatorNode;
  gain: GainNode;
}

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private musicBus: GainNode | null = null;
  private sfxBus: GainNode | null = null;
  private drone: Voice | null = null;
  private voices: Voice[] = [];
  private musicOn = false;
  private musicVol = 0.6;
  private sfxVol = 0.8;
  private muted = false;
  private wantedVoices = 0;

  /** Browsers only allow audio after a user gesture, so this is called from the first click or key press. */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.musicBus = this.ctx.createGain();
        this.sfxBus = this.ctx.createGain();
        this.musicBus.connect(this.master);
        this.sfxBus.connect(this.master);
        this.master.connect(this.ctx.destination);
        this.applyVolumes();
        if (this.musicOn) this.startMusic();
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolumes(music: number, sfx: number, muted: boolean): void {
    this.musicVol = music;
    this.sfxVol = sfx;
    this.muted = muted;
    this.applyVolumes();
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.master || !this.musicBus || !this.sfxBus) return;
    const t = this.ctx.currentTime;
    this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.03);
    this.musicBus.gain.setTargetAtTime(this.musicVol * 0.55, t, 0.05);
    this.sfxBus.gain.setTargetAtTime(this.sfxVol, t, 0.05);
  }

  private makeVoice(freq: number, level: number, type: OscillatorType = 'sine'): Voice | null {
    if (!this.ctx || !this.musicBus) return null;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    osc.detune.value = (Math.random() - 0.5) * 12;
    gain.gain.value = 0;
    osc.connect(gain);
    gain.connect(this.musicBus);
    osc.start();
    gain.gain.setTargetAtTime(level, this.ctx.currentTime, 0.8);
    return { osc, gain };
  }

  private dropVoice(v: Voice): void {
    if (!this.ctx) return;
    v.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.25);
    v.osc.stop(this.ctx.currentTime + 1.5);
  }

  startMusic(): void {
    this.musicOn = true;
    if (!this.ctx || this.drone) return;
    this.drone = this.makeVoice(ROOT_HZ / 2, 0.16);
    this.setGhostCount(this.wantedVoices);
  }

  stopMusic(): void {
    this.musicOn = false;
    if (this.drone) this.dropVoice(this.drone);
    this.drone = null;
    for (const v of this.voices) this.dropVoice(v);
    this.voices = [];
  }

  /** One pad note per ghost, up to a cap. */
  setGhostCount(n: number): void {
    this.wantedVoices = n;
    if (!this.ctx || !this.musicOn) return;
    const target = Math.min(n, MAX_VOICES);
    while (this.voices.length < target) {
      const i = this.voices.length;
      const semis = SCALE[i % SCALE.length] + 12 * Math.floor(i / SCALE.length);
      const v = this.makeVoice(ROOT_HZ * Math.pow(2, semis / 12), 0.07);
      if (!v) break;
      this.voices.push(v);
    }
    while (this.voices.length > target) {
      const v = this.voices.pop();
      if (v) this.dropVoice(v);
    }
  }

  private tone(freq: number, dur: number, type: OscillatorType, vol: number, slideTo?: number, delay = 0): void {
    if (!this.ctx || !this.sfxBus) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(this.sfxBus);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  private noise(dur: number, vol: number): void {
    if (!this.ctx || !this.sfxBus) return;
    const len = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    const filter = this.ctx.createBiquadFilter();
    const gain = this.ctx.createGain();
    src.buffer = buf;
    filter.type = 'lowpass';
    filter.frequency.value = 900;
    gain.gain.value = vol;
    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.sfxBus);
    src.start();
  }

  /** Pitch climbs a semitone per coin in the chain, up to an octave and a half. */
  coin(combo = 1, risky = false): void {
    const k = 2 ** (Math.min(Math.max(combo - 1, 0), 18) / 12);
    this.tone(660 * k, 0.09, 'sine', 0.35);
    this.tone(990 * k, 0.16, 'sine', 0.35, undefined, 0.07);
    if (risky) this.tone(1480 * k, 0.2, 'triangle', 0.22, undefined, 0.12);
  }

  comboLost(): void {
    this.tone(330, 0.18, 'sine', 0.16, 220);
  }

  near(): void {
    this.tone(1300, 0.09, 'triangle', 0.18, 1900);
  }

  clear(): void {
    [440, 554, 659, 880].forEach((f, i) => this.tone(f, 0.16, 'sine', 0.28, undefined, i * 0.07));
  }

  death(): void {
    this.tone(220, 0.55, 'sawtooth', 0.28, 50);
    this.noise(0.35, 0.5);
  }

  click(): void {
    this.tone(520, 0.05, 'square', 0.07);
  }

  tick(final: boolean): void {
    this.tone(final ? 880 : 440, 0.1, 'sine', 0.2);
  }
}
