import { beepOn, engineMix, type SeekerTone } from './sound-mix.ts';

export interface SoundFrame {
  alive: boolean;
  throttle: number;
  airspeedMs: number;
  seeker: SeekerTone;
  missileWarning: boolean;
  firingCannon: boolean;
  /** cannon projectiles per second, for the "brrt" rhythm */
  cannonRateHz: number;
  timeS: number;
}

const MASTER_GAIN = 0.7;
const SMOOTH_S = 0.05;

/**
 * Synthesized cockpit sound (spec §15.5): engine, afterburner, wind, cannon, seeker growl and lock tone, missile
 * warning, and one-shot launches, hits, flares and explosions. No audio files.
 */
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly noise: AudioBuffer;
  private readonly engineOscs: OscillatorNode[];
  private readonly engineGain: GainNode;
  private readonly abGain: GainNode;
  private readonly windFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly cannonGain: GainNode;
  private readonly cannonLfo: OscillatorNode;
  private readonly cannonDepth: GainNode;
  private readonly growlGain: GainNode;
  private readonly lockGain: GainNode;
  private readonly warnGain: GainNode;
  private muted = false;

  /** Null when the browser has no Web Audio; the game then runs silently. */
  static create(): AudioEngine | null {
    try {
      return new AudioEngine(new AudioContext());
    } catch (err) {
      console.info('Sound unavailable:', err instanceof Error ? err.message : String(err));
      return null;
    }
  }

  private constructor(ctx: AudioContext) {
    this.ctx = ctx;
    const compressor = ctx.createDynamicsCompressor();
    compressor.connect(ctx.destination);
    this.master = this.gain(MASTER_GAIN, compressor);
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.engineGain = this.gain(0, this.master);
    const engineFilter = this.filter('lowpass', 700, 0.7, this.engineGain);
    this.engineOscs = [this.osc('sawtooth', 60, engineFilter), this.osc('sawtooth', 90, engineFilter)];

    this.abGain = this.gain(0, this.master);
    this.loopNoise(this.filter('lowpass', 450, 0.7, this.abGain));

    this.windGain = this.gain(0, this.master);
    this.windFilter = this.filter('bandpass', 1000, 0.6, this.windGain);
    this.loopNoise(this.windFilter);

    this.cannonGain = this.gain(0, this.master);
    this.loopNoise(this.filter('bandpass', 900, 1.2, this.cannonGain));
    this.cannonDepth = this.gain(0, this.cannonGain.gain);
    this.cannonLfo = this.osc('square', 25, this.cannonDepth);

    this.growlGain = this.gain(0, this.master);
    const growl = this.osc('triangle', 440, this.growlGain);
    const warble = this.gain(60, growl.frequency);
    this.osc('sine', 12, warble);

    this.lockGain = this.gain(0, this.master);
    this.osc('sine', 1350, this.lockGain);

    this.warnGain = this.gain(0, this.master);
    this.osc('square', 950, this.warnGain);
  }

  /** Browsers start audio suspended until a click; call this from input handlers. */
  resume(): void {
    if (this.ctx.state !== 'suspended') return;
    this.ctx.resume().catch((err: unknown) => console.info('Sound could not start:', err instanceof Error ? err.message : String(err)));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.set(this.master.gain, muted ? 0 : MASTER_GAIN);
  }

  update(f: SoundFrame): void {
    const mix = engineMix(f.throttle, f.airspeedMs, f.alive);
    this.set(this.engineGain.gain, mix.engineGain);
    this.set(this.engineOscs[0].frequency, mix.engineHz);
    this.set(this.engineOscs[1].frequency, mix.engineHz * 1.5);
    this.set(this.abGain.gain, mix.afterburnerGain);
    this.set(this.windGain.gain, mix.windGain);
    this.set(this.windFilter.frequency, mix.windHz);
    const firing = f.alive && f.firingCannon;
    this.set(this.cannonGain.gain, firing ? 0.3 : 0);
    this.set(this.cannonDepth.gain, firing ? 0.25 : 0);
    this.set(this.cannonLfo.frequency, f.cannonRateHz);
    this.set(this.growlGain.gain, f.alive && f.seeker === 'growl' ? 0.07 : 0);
    this.set(this.lockGain.gain, f.alive && f.seeker === 'lock' ? 0.06 : 0);
    this.set(this.warnGain.gain, f.alive && f.missileWarning && beepOn(f.timeS, 5) ? 0.05 : 0, 0.005);
  }

  /** Silences the loops (pause, match end) without muting one-shots already playing. */
  quiet(): void {
    for (const g of [this.engineGain, this.abGain, this.windGain, this.cannonGain, this.cannonDepth, this.growlGain, this.lockGain, this.warnGain]) {
      this.set(g.gain, 0);
    }
  }

  explosion(gain: number): void {
    if (gain <= 0.01 || this.muted) return;
    this.burst(1.6, 'lowpass', 500, gain * 0.9);
  }

  launch(): void {
    this.burst(1, 'bandpass', 700, 0.35);
  }

  /** A short low thump as a bomb leaves the aircraft. */
  bombRelease(): void {
    this.burst(0.3, 'lowpass', 260, 0.35);
  }

  hit(): void {
    this.burst(0.12, 'bandpass', 2200, 0.25);
  }

  flare(): void {
    this.burst(0.15, 'highpass', 1800, 0.12);
  }

  dispose(): void {
    this.ctx.close().catch((err: unknown) => console.info('Sound shutdown failed:', err instanceof Error ? err.message : String(err)));
  }

  private set(param: AudioParam, value: number, smoothS = SMOOTH_S): void {
    param.setTargetAtTime(value, this.ctx.currentTime, smoothS);
  }

  private gain(value: number, to: AudioNode | AudioParam): GainNode {
    const g = this.ctx.createGain();
    g.gain.value = value;
    if (to instanceof AudioNode) g.connect(to);
    else g.connect(to);
    return g;
  }

  private filter(type: BiquadFilterType, hz: number, q: number, to: AudioNode): BiquadFilterNode {
    const f = this.ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = hz;
    f.Q.value = q;
    f.connect(to);
    return f;
  }

  private osc(type: OscillatorType, hz: number, to: AudioNode | AudioParam): OscillatorNode {
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    if (to instanceof AudioNode) o.connect(to);
    else o.connect(to);
    o.start();
    return o;
  }

  private loopNoise(to: AudioNode): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    src.connect(to);
    src.start();
  }

  /** A short filtered noise burst with a fast attack and exponential decay. */
  private burst(durationS: number, type: BiquadFilterType, hz: number, peak: number): void {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const g = this.gain(0, this.master);
    src.connect(this.filter(type, hz, 0.8, g));
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + durationS);
    src.start(now);
    src.stop(now + durationS + 0.05);
    src.onended = () => g.disconnect();
  }
}
