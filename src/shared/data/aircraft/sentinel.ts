import type { AircraftConfig } from './types.ts';

/**
 * The Sentinel (spec §13, Team Objective, M5): a fictional, slow, four-engine radar aircraft with a rotating dish on
 * its back. Each team has its own, flown by the mode; nobody can choose it. It carries no weapons, only
 * countermeasures, and its all-round long-range radar feeds its team's datalink.
 */
function sentinel(team: 'usa' | 'russia'): AircraftConfig {
  return {
    id: `sentinel-${team}`,
    name: 'Sentinel',
    team,
    role: 'Airborne radar',
    description: 'A slow radar aircraft that watches the whole front for its team. It cannot fight back.',
    support: true,
    physics: {
      massKg: 60000,
      wingAreaM2: 250,
      thrustMilN: 160000,
      thrustAbN: 160000,
      cd0: 0.025,
      k: 0.06,
      clAlpha: 5,
      alphaMaxDeg: 15,
      aoaLimiterDeg: 15,
      gMax: 2.5,
      gMin: -1,
      maxPitchRateDegS: 6,
      maxRollRateDegS: 30,
      maxYawRateDegS: 5,
      thrustVectoring: 0,
    },
    sensors: {
      radarRangeKm: 150,
      radarConeDeg: 180,
      stealth: 0,
      irSignature: 1.5,
      helmetSight: false,
      twoSeat: true,
      sensorFusion: false,
    },
    stores: { cannon: 'RC-20', cannonRounds: 0, srm: 0, mrm: 0, countermeasures: 60 },
    damage: { hitPoints: 400, hitRadiusM: 16 },
    visual: {
      lengthM: 46,
      spanM: 44,
      fuselageRadiusM: 2.1,
      noseLengthFraction: 0.1,
      wingSweepDeg: 32,
      wingRootChordM: 9,
      wingTipChordM: 2.5,
      wingPositionFraction: 0.38,
      tail: 'single',
      tailHeightM: 10,
      canards: false,
      engines: 2,
      colors: team === 'usa' ? { primary: '#9aa3ab', secondary: '#c9ced3', accent: '#2f3438' } : { primary: '#8d9aa6', secondary: '#b9c4cc', accent: '#2c3640' },
    },
    hudUnits: team === 'usa' ? 'imperial' : 'metric',
    performance: {
      topSpeedMach11km: [0.6, 0.8],
      topSpeedMachSeaLevel: [0.5, 0.7],
      instantTurnDegS170: [2, 6],
      stallSpeedMs: [50, 65],
    },
  };
}

export const sentinelUsa = sentinel('usa');
export const sentinelRussia = sentinel('russia');
