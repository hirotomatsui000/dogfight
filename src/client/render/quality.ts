/** Graphics presets (spec §24, M1c). */
export type QualityLevel = 'low' | 'medium' | 'high';
export const QUALITY_LEVELS: readonly QualityLevel[] = ['low', 'medium', 'high'];

export interface QualityPreset {
  /** cap on device pixels per CSS pixel */
  pixelRatio: number;
  antialias: boolean;
  /** share of smoke and fire particles kept */
  particles: number;
  /** texture anisotropy for the ground photos */
  anisotropy: number;
  /** terrain detail: a ground chunk splits when nearer than this many chunk widths (M4) */
  terrainDetail: number;
}

export const QUALITY_PRESETS: Readonly<Record<QualityLevel, QualityPreset>> = {
  low: { pixelRatio: 0.75, antialias: false, particles: 0.5, anisotropy: 2, terrainDetail: 1.1 },
  medium: { pixelRatio: 1, antialias: true, particles: 0.75, anisotropy: 4, terrainDetail: 1.4 },
  high: { pixelRatio: 2, antialias: true, particles: 1, anisotropy: 8, terrainDetail: 1.8 },
};

/** Screens larger than this many device pixels start Auto on Medium (a Retina laptop panel stays on High; 4K drops). */
export const LARGE_SCREEN_PX = 6_000_000;

/** Auto's first guess: High, or Medium on very large screens. */
export function initialAutoLevel(cssWidth: number, cssHeight: number, devicePixelRatio: number): QualityLevel {
  const ratio = Math.min(devicePixelRatio, QUALITY_PRESETS.high.pixelRatio);
  return cssWidth * cssHeight * ratio * ratio > LARGE_SCREEN_PX ? 'medium' : 'high';
}

/** The level to use now: the player's choice, or for Auto the level it settled on before (or its first guess). */
export function resolveQuality(
  graphics: 'auto' | QualityLevel,
  autoLevel: QualityLevel | null,
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio: number,
): QualityLevel {
  if (graphics !== 'auto') return graphics;
  return autoLevel ?? initialAutoLevel(cssWidth, cssHeight, devicePixelRatio);
}

export function lowerLevel(level: QualityLevel): QualityLevel {
  return level === 'high' ? 'medium' : 'low';
}

/** Low frame rate that makes Auto step down, and how long it must last. */
export const SLOW_FPS = 45;
export const SLOW_WINDOW_S = 3;
/** The first seconds of a match (shader compiles, first uploads) do not count. */
export const WARMUP_S = 4;

/**
 * Watches frame times in a match and steps Auto down one level after `SLOW_WINDOW_S` of frames slower than
 * `SLOW_FPS` on average. It never steps back up within a session, so the picture does not keep changing.
 */
export class QualityGovernor {
  level: QualityLevel;
  private elapsedS = 0;
  private windowS = 0;
  private windowFrames = 0;

  constructor(level: QualityLevel) {
    this.level = level;
  }

  /** Feed each frame's duration; returns the new level when it changes, otherwise null. */
  frame(dtS: number): QualityLevel | null {
    if (!(dtS > 0) || dtS > 1) return null;
    this.elapsedS += dtS;
    if (this.elapsedS < WARMUP_S || this.level === 'low') return null;
    this.windowS += dtS;
    this.windowFrames++;
    if (this.windowS < SLOW_WINDOW_S) return null;
    const fps = this.windowFrames / this.windowS;
    this.windowS = 0;
    this.windowFrames = 0;
    if (fps >= SLOW_FPS) return null;
    this.level = lowerLevel(this.level);
    // Give the new level its own warm-up before judging it.
    this.elapsedS = 0;
    return this.level;
  }
}
