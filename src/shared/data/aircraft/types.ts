export type TeamId = 'usa' | 'russia';
export type CannonId = 'RC-20' | 'RC-25' | 'HC-30';
export type TailType = 'single' | 'twin' | 'twin-canted';
export type UnitSystem = 'imperial' | 'metric';
export type Range = readonly [min: number, max: number];

export interface AircraftPhysics {
  massKg: number;
  wingAreaM2: number;
  thrustMilN: number;
  thrustAbN: number;
  /** zero-lift drag coefficient (subsonic) */
  cd0: number;
  /** induced drag factor: CDi = k * CL^2 */
  k: number;
  /** lift-curve slope, per radian */
  clAlpha: number;
  /** angle of attack at maximum lift */
  alphaMaxDeg: number;
  /** fly-by-wire angle-of-attack limit (>= alphaMaxDeg; higher = can stall) */
  aoaLimiterDeg: number;
  gMax: number;
  gMin: number;
  maxPitchRateDegS: number;
  maxRollRateDegS: number;
  maxYawRateDegS: number;
  /** 0 = none, 1 = full 3-D thrust vectoring */
  thrustVectoring: number;
}

export interface AircraftSensors {
  radarRangeKm: number;
  /** half-angle of the radar cone */
  radarConeDeg: number;
  /** 0 = conventional, 1 = invisible to radar */
  stealth: number;
  /** multiplier for infrared detectability */
  irSignature: number;
  helmetSight: boolean;
  twoSeat: boolean;
  sensorFusion: boolean;
}

export interface AircraftStores {
  cannon: CannonId;
  cannonRounds: number;
  srm: number;
  mrm: number;
  countermeasures: number;
}

export interface AircraftDamage {
  hitPoints: number;
  hitRadiusM: number;
}

export interface AircraftVisual {
  lengthM: number;
  spanM: number;
  fuselageRadiusM: number;
  /** fraction of the length taken by the nose taper */
  noseLengthFraction: number;
  wingSweepDeg: number;
  wingRootChordM: number;
  wingTipChordM: number;
  /** wing root leading edge position, as a fraction of length from the nose */
  wingPositionFraction: number;
  tail: TailType;
  tailHeightM: number;
  canards: boolean;
  engines: 1 | 2;
  colors: { primary: string; secondary: string; accent: string };
}

export interface PerformanceTargets {
  topSpeedMach11km: Range;
  topSpeedMachSeaLevel: Range;
  /** instantaneous turn rate at 170 m/s, 1 000 m, full aft stick */
  instantTurnDegS170: Range;
  /** 1 G level stall speed at sea level */
  stallSpeedMs: Range;
}

export interface AircraftConfig {
  id: string;
  name: string;
  team: TeamId;
  role: string;
  description: string;
  physics: AircraftPhysics;
  sensors: AircraftSensors;
  stores: AircraftStores;
  damage: AircraftDamage;
  visual: AircraftVisual;
  hudUnits: UnitSystem;
  performance: PerformanceTargets;
}
