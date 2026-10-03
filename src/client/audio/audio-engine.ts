import { beepOn, dopplerFactor, type SeekerTone, windMix } from './sound-mix.ts';

interface Vec3 {
  x: number;
  y: number;
  z: number;
}

/** A missile near the listener (M5). */
export interface NearbySound {
  pos: Vec3;
  vel: Vec3;
}

export interface SoundFrame {
  alive: boolean;
  airspeedMs: number;
  seeker: SeekerTone;
  missileWarning: boolean;
  /** RWR: an enemy radar lock is on the jet */
  rwrLock: boolean;
  firingCannon: boolean;
  /** cannon projectiles per second, for the "brrt" rhythm */
  cannonRateHz: number;
  timeS: number;
  /** M5: the stall horn and the pull-up tone, with the HUD's STALL and PULL UP */
  stall?: boolean;
  pullUp?: boolean;
  /** M5: speed rolling on the runway, m/s (0 in the air) */
  rollingMs?: number;
  /** M5: rain round the camera */
  rain?: boolean;
  /** M5: where the listener (the camera) is, which way it faces, and how fast it moves */
  listener?: { pos: Vec3; forward: Vec3; up: Vec3; vel: Vec3 };
  /** M5: the missiles nearest the listener, nearest first */
  missiles?: readonly NearbySound[];
}

const MASTER_GAIN = 0.7;
const SMOOTH_S = 0.05;
/** Positional voices for missiles going past. */
const MISSILE_VOICES = 1;
const MISSILE_HEAR_M = 700;

interface Voice {
  panner: PannerNode;
  gain: GainNode;
  /** pitch carriers the Doppler factor scales */
  oscs: OscillatorNode[];
  filter: BiquadFilterNode;
  baseHz: number[];
  filterHz: number;
}

/**
 * Synthesized cockpit sound (spec §15.5): wind, cannon, seeker growl and lock tone, radar-lock beeps, missile and
 * radar-lock (RWR) warnings, and one-shot launches, hits, flares and explosions. M5 adds positional sound (explosions,
 * missiles going past), the stall horn and pull-up tone, runway rumble, the gear motor, rain, and chimes for kills,
 * zones, Sentinels and the end of a match. No audio files. (The engine, the afterburner and other jets' engines were
 * removed at the owner's request in revision 19.)
 */
export class AudioEngine {
  private readonly ctx: AudioContext;
  private readonly master: GainNode;
  private readonly noise: AudioBuffer;
  private readonly windFilter: BiquadFilterNode;
  private readonly windGain: GainNode;
  private readonly cannonGain: GainNode;
  private readonly cannonLfo: OscillatorNode;
  private readonly cannonDepth: GainNode;
  private readonly growlGain: GainNode;
  private readonly lockGain: GainNode;
  private readonly warnGain: GainNode;
  private readonly rwrGain: GainNode;
  private readonly stallGain: GainNode;
  private readonly pullUpGain: GainNode;
  private readonly pullUpOsc: OscillatorNode;
  private readonly rumbleGain: GainNode;
  private readonly rainGain: GainNode;
  private readonly missileVoices: Voice[] = [];
  private muted = false;
  /** master volume from the settings, 0..1 */
  private volume = 1;

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

    // RWR: a two-tone warble, low enough not to be mistaken for the missile warning.
    this.rwrGain = this.gain(0, this.master);
    const rwr = this.osc('triangle', 620, this.rwrGain);
    const rwrSwing = this.gain(140, rwr.frequency);
    this.osc('square', 7, rwrSwing);

    // Stall horn: a low, buzzy pulse.
    this.stallGain = this.gain(0, this.master);
    this.osc('square', 310, this.filter('lowpass', 1100, 0.7, this.stallGain));

    // Pull-up: a high two-tone, switched between its notes each frame.
    this.pullUpGain = this.gain(0, this.master);
    this.pullUpOsc = this.osc('triangle', 900, this.pullUpGain);

    // Runway rumble and rain.
    this.rumbleGain = this.gain(0, this.master);
    this.loopNoise(this.filter('lowpass', 140, 0.9, this.rumbleGain));
    this.rainGain = this.gain(0, this.master);
    this.loopNoise(this.filter('highpass', 2600, 0.5, this.rainGain));

    for (let i = 0; i < MISSILE_VOICES; i++) this.missileVoices.push(this.voice([], 'sawtooth', 'highpass', 1400));
  }

  /** Browsers start audio suspended until a click; call this from input handlers. */
  resume(): void {
    if (this.ctx.state !== 'suspended') return;
    this.ctx.resume().catch((err: unknown) => console.info('Sound could not start:', err instanceof Error ? err.message : String(err)));
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.set(this.master.gain, muted ? 0 : MASTER_GAIN * this.volume);
  }

  setVolume(volume: number): void {
    this.volume = Math.min(1, Math.max(0, volume));
    this.setMuted(this.muted);
  }

  update(f: SoundFrame): void {
    const mix = windMix(f.airspeedMs, f.alive);
    this.set(this.windGain.gain, mix.windGain);
    this.set(this.windFilter.frequency, mix.windHz);
    const firing = f.alive && f.firingCannon;
    this.set(this.cannonGain.gain, firing ? 0.3 : 0);
    this.set(this.cannonDepth.gain, firing ? 0.25 : 0);
    this.set(this.cannonLfo.frequency, f.cannonRateHz);
    this.set(this.growlGain.gain, f.alive && f.seeker === 'growl' ? 0.07 : 0);
    const lockOn = f.seeker === 'lock' || f.seeker === 'radar-lock' || (f.seeker === 'radar-track' && beepOn(f.timeS, 4, 0.35));
    this.set(this.lockGain.gain, f.alive && lockOn ? 0.06 : 0, 0.005);
    this.set(this.rwrGain.gain, f.alive && f.rwrLock && !f.missileWarning ? 0.045 : 0);
    this.set(this.warnGain.gain, f.alive && f.missileWarning && beepOn(f.timeS, 5) ? 0.05 : 0, 0.005);
    this.set(this.stallGain.gain, f.alive && f.stall && !f.pullUp && beepOn(f.timeS, 2.5, 0.6) ? 0.05 : 0, 0.01);
    this.set(this.pullUpGain.gain, f.alive && f.pullUp ? 0.05 : 0, 0.01);
    this.set(this.pullUpOsc.frequency, beepOn(f.timeS, 4) ? 900 : 700, 0.005);
    this.set(this.rumbleGain.gain, f.alive ? 0.3 * Math.min(1, (f.rollingMs ?? 0) / 70) : 0);
    this.set(this.rainGain.gain, f.rain ? 0.035 : 0, 0.3);
    if (f.listener) this.placeListener(f.listener);
    this.updateVoices(this.missileVoices, f.missiles ?? [], f.listener, (d) => {
      const k = Math.max(0, 1 - d / MISSILE_HEAR_M);
      return 0.35 * k * k;
    });
  }

  /** Silences the loops (pause, match end) without muting one-shots already playing. */
  quiet(): void {
    const loops = [this.windGain, this.cannonGain, this.cannonDepth, this.growlGain, this.lockGain, this.warnGain, this.rwrGain, this.stallGain, this.pullUpGain, this.rumbleGain, this.rainGain];
    for (const g of [...loops, ...this.missileVoices.map((v) => v.gain)]) this.set(g.gain, 0);
  }

  explosion(gain: number): void {
    if (gain <= 0.01 || this.muted) return;
    this.burst(1.6, 'lowpass', 500, gain * 0.9);
  }

  /** An explosion heard from where it happened (M5): panned, and as loud as `gain` says. */
  explosionAt(pos: Vec3, gain: number): void {
    if (gain <= 0.01 || this.muted) return;
    const panner = this.panner(this.master);
    this.place(panner, pos);
    this.burst(1.6, 'lowpass', 500, gain * 0.9, panner);
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

  /** The gear motor as the wheels come up (M5). */
  gearMotor(): void {
    this.sweep('sawtooth', 160, 240, 1.2, 0.035, 900);
  }

  /** A soft whoosh for a new jet (M5). */
  respawn(): void {
    this.burst(0.7, 'bandpass', 900, 0.1);
  }

  /** Two rising notes for a confirmed kill (M5). */
  killConfirmed(): void {
    this.notes([880, 1320], 0.09, 'sine', 0.1);
  }

  /** Zones (M5): rising for one of ours, falling for one we lost. */
  zoneChanged(good: boolean): void {
    this.notes(good ? [523, 659, 784] : [784, 622, 494], 0.11, 'triangle', 0.09);
  }

  /** Sentinels (M5): an alarm when ours goes down, a bright chime for theirs. */
  sentinelDown(ours: boolean): void {
    if (ours) this.notes([700, 520, 700, 520], 0.16, 'square', 0.045);
    else this.notes([660, 880, 1100], 0.1, 'sine', 0.1);
  }

  /** Fuel (revision 16): two low chimes at BINGO, three falling ones when the engines flame out. */
  fuelWarning(flameout: boolean): void {
    this.notes(flameout ? [523, 440, 349] : [440, 440], 0.18, 'square', 0.05);
  }

  /** The end of a match (M5): a major chord for a win, minor for a loss, open for a draw. */
  matchEnd(result: 'win' | 'loss' | 'draw'): void {
    const chord = result === 'win' ? [392, 494, 587] : result === 'loss' ? [392, 466, 587] : [392, 587];
    for (const hz of chord) this.tone('sine', hz, this.ctx.currentTime, 1.8, 0.06);
  }

  dispose(): void {
    this.ctx.close().catch((err: unknown) => console.info('Sound shutdown failed:', err instanceof Error ? err.message : String(err)));
  }

  private updateVoices(voices: Voice[], sources: readonly NearbySound[], listener: SoundFrame['listener'], loudness: (distanceM: number) => number): void {
    voices.forEach((v, i) => {
      const s = sources[i];
      if (!s || !listener) {
        this.set(v.gain.gain, 0, 0.15);
        return;
      }
      const rel = { x: s.pos.x - listener.pos.x, y: s.pos.y - listener.pos.y, z: s.pos.z - listener.pos.z };
      const d = Math.hypot(rel.x, rel.y, rel.z);
      const doppler = dopplerFactor(rel, s.vel, listener.vel);
      this.place(v.panner, s.pos);
      this.set(v.gain.gain, loudness(d), 0.08);
      v.oscs.forEach((o, k) => this.set(o.frequency, v.baseHz[k] * doppler, 0.05));
      this.set(v.filter.frequency, v.filterHz * doppler, 0.05);
    });
  }

  private placeListener(l: NonNullable<SoundFrame['listener']>): void {
    const a = this.ctx.listener;
    const t = this.ctx.currentTime;
    if (a.positionX) {
      a.positionX.setValueAtTime(l.pos.x, t);
      a.positionY.setValueAtTime(l.pos.y, t);
      a.positionZ.setValueAtTime(l.pos.z, t);
      a.forwardX.setValueAtTime(l.forward.x, t);
      a.forwardY.setValueAtTime(l.forward.y, t);
      a.forwardZ.setValueAtTime(l.forward.z, t);
      a.upX.setValueAtTime(l.up.x, t);
      a.upY.setValueAtTime(l.up.y, t);
      a.upZ.setValueAtTime(l.up.z, t);
    } else {
      a.setPosition(l.pos.x, l.pos.y, l.pos.z);
      a.setOrientation(l.forward.x, l.forward.y, l.forward.z, l.up.x, l.up.y, l.up.z);
    }
  }

  private place(p: PannerNode, pos: Vec3): void {
    const t = this.ctx.currentTime;
    if (p.positionX) {
      p.positionX.setValueAtTime(pos.x, t);
      p.positionY.setValueAtTime(pos.y, t);
      p.positionZ.setValueAtTime(pos.z, t);
    } else {
      p.setPosition(pos.x, pos.y, pos.z);
    }
  }

  /** Direction only: the game sets each voice's loudness from the distance itself. */
  private panner(to: AudioNode): PannerNode {
    const p = this.ctx.createPanner();
    p.panningModel = 'equalpower';
    p.distanceModel = 'linear';
    p.rolloffFactor = 0;
    p.connect(to);
    return p;
  }

  private voice(baseHz: number[], type: OscillatorType, filterType: BiquadFilterType, filterHz: number): Voice {
    const panner = this.panner(this.master);
    const gain = this.gain(0, panner);
    const filter = this.filter(filterType, filterHz, 0.8, gain);
    this.loopNoise(filter);
    const oscs = baseHz.map((hz) => this.osc(type, hz, this.filter('lowpass', 900, 0.7, gain)));
    return { panner, gain, oscs, filter, baseHz, filterHz };
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
    // Each loop starts at its own point in the buffer, so voices sharing it do not sound alike.
    src.connect(to);
    src.start(0, Math.random() * this.noise.duration);
  }

  /** A short filtered noise burst with a fast attack and exponential decay. */
  private burst(durationS: number, type: BiquadFilterType, hz: number, peak: number, to: AudioNode = this.master): void {
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const g = this.gain(0, to);
    src.connect(this.filter(type, hz, 0.8, g));
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.001, now + durationS);
    src.start(now);
    src.stop(now + durationS + 0.05);
    src.onended = () => {
      g.disconnect();
      if (to !== this.master) to.disconnect();
    };
  }

  /** One enveloped oscillator note. */
  private tone(type: OscillatorType, hz: number, at: number, durationS: number, peak: number): void {
    if (this.muted) return;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.value = hz;
    const g = this.gain(0, this.master);
    o.connect(g);
    g.gain.setValueAtTime(0, at);
    g.gain.linearRampToValueAtTime(peak, at + 0.015);
    g.gain.exponentialRampToValueAtTime(0.001, at + durationS);
    o.start(at);
    o.stop(at + durationS + 0.05);
    o.onended = () => g.disconnect();
  }

  private notes(freqs: readonly number[], stepS: number, type: OscillatorType, peak: number): void {
    const now = this.ctx.currentTime;
    freqs.forEach((hz, i) => this.tone(type, hz, now + i * stepS, stepS * 2.2, peak));
  }

  /** A pitch glide (the gear motor). */
  private sweep(type: OscillatorType, fromHz: number, toHz: number, durationS: number, peak: number, lowpassHz: number): void {
    if (this.muted) return;
    const now = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(fromHz, now);
    o.frequency.linearRampToValueAtTime(toHz, now + durationS);
    const g = this.gain(0, this.master);
    o.connect(this.filter('lowpass', lowpassHz, 0.7, g));
    g.gain.setValueAtTime(0, now);
    g.gain.linearRampToValueAtTime(peak, now + 0.1);
    g.gain.setValueAtTime(peak, now + durationS - 0.2);
    g.gain.linearRampToValueAtTime(0, now + durationS);
    o.start(now);
    o.stop(now + durationS + 0.05);
    o.onended = () => g.disconnect();
  }
}
