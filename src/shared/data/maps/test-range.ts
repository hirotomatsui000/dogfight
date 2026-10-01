import type { LandCover } from '../../map/land-cover.ts';
import { createNoise2D, fbm2D } from '../../math/noise.ts';
import { lerp, smoothstep } from '../../math/units.ts';
import type { MapDefinition } from './map-definition.ts';

/**
 * 60 x 60 km procedural test range: rolling farmland, a lake, a river valley running north to the sea,
 * a mountain ridge in the south and a coastline along the north edge.
 */
export function createTestRange(seed = 1): MapDefinition {
  const noise = createNoise2D(seed);
  const coastZ = (x: number) => -22000 + 1500 * noise(x / 7000 + 200, 3.7);
  const riverX = (z: number) => 5000 + 2000 * Math.sin(z / 7000) + 600 * noise(z / 4000, 11.3);
  const riverLevel = (z: number) => Math.max(1, 3 + (z + 22000) * 0.0025);
  const lake = { x: -9000, z: -6000, radius: 2200, level: 0 };

  const baseHeight = (x: number, z: number): number => {
    let h = 110 + 45 * fbm2D(noise, x / 9000, z / 9000, 4) + 12 * fbm2D(noise, x / 1800 + 50, z / 1800 + 50, 3);
    const ridgeWeight = smoothstep(9000, 20000, z);
    if (ridgeWeight > 0) {
      const ridged = 1 - Math.abs(noise(x / 5000 + 100, z / 5000 + 100));
      h += ridgeWeight * (350 + 750 * ridged * ridged);
    }
    return h;
  };

  // Lake surface sits 5 m below the lowest point of its basin so it never floats above the land.
  // Sample the whole basin (the lake plus 1.2 km of shore), not just the shoreline: land just beyond the
  // shore can dip lower, which would leave the lake floating above it.
  let basinMin = Infinity;
  const basinRadius = lake.radius + 1200;
  for (let ring = 0; ring <= 12; ring++) {
    const r = (ring / 12) * basinRadius;
    for (let k = 0; k < 48; k++) {
      const a = (k / 48) * 2 * Math.PI;
      basinMin = Math.min(basinMin, baseHeight(lake.x + Math.cos(a) * r, lake.z + Math.sin(a) * r));
    }
  }
  lake.level = basinMin - 5;

  const inRiver = (x: number, z: number) => z > coastZ(x) - 500 && Math.abs(x - riverX(z)) < 250;
  const inLake = (x: number, z: number) => Math.hypot(x - lake.x, z - lake.z) < lake.radius;

  const height = (x: number, z: number): number => {
    let h = baseHeight(x, z);
    const coast = coastZ(x);
    if (z > coast - 500) {
      const level = riverLevel(z);
      const d = Math.abs(x - riverX(z));
      if (d < 250) h = Math.min(h, level);
      else if (d < 1200) h = Math.min(h, lerp(level, h, smoothstep(250, 1200, d)));
    }
    const dLake = Math.hypot(x - lake.x, z - lake.z);
    if (dLake < lake.radius) h = lake.level;
    else if (dLake < lake.radius + 800) h = Math.min(h, lerp(lake.level + 2, h, smoothstep(lake.radius, lake.radius + 800, dLake)));
    if (z < coast) h = Math.min(h, -2 - (coast - z) * 0.02);
    else if (z < coast + 1500) h = lerp(2, h, smoothstep(coast, coast + 1500, z));
    return h;
  };

  const landCover = (x: number, z: number, h: number, slope: number): LandCover => {
    if (h <= 0) return 'sea';
    if (inLake(x, z)) return 'lake';
    if (inRiver(x, z)) return 'river';
    if (h < 6 && z < coastZ(x) + 600) return 'beach';
    if (slope > 0.2) return 'rock';
    if (h > 1050) return 'snow';
    const f = noise(x / 2500 + 300, z / 2500 + 300);
    if (h > 450) return f > -0.2 ? 'forest' : 'meadow';
    if (f > 0.35) return 'forest';
    if (f > 0.15) return 'meadow';
    return 'field';
  };

  return {
    id: 'test-range',
    name: 'Test Range',
    sizeM: 60000,
    resolution: 513,
    seed,
    combatArea: { x: 0, z: 0, radiusM: 25000 },
    spawns: {
      usa: { x: -7500, z: 0, headingRad: Math.PI / 2, altitudeM: 3000 },
      russia: { x: 7500, z: 0, headingRad: (3 * Math.PI) / 2, altitudeM: 3000 },
    },
    // Strike (spec §12.2): fictional facilities on flat farmland west of the river, defenders 8 km behind them,
    // attackers 24 km to the east.
    strike: {
      targets: [
        { id: 'A', kind: 'depot', label: 'Supply depot', x: -5000, z: -8000 },
        { id: 'B', kind: 'radar', label: 'Radar site', x: -6000, z: 0 },
        { id: 'C', kind: 'fuel', label: 'Fuel depot', x: -6000, z: 8000 },
      ],
      spawns: {
        usa: { x: -14000, z: 0, headingRad: Math.PI / 2, altitudeM: 4000 },
        russia: { x: 18000, z: 0, headingRad: (3 * Math.PI) / 2, altitudeM: 5000 },
      },
    },
    height,
    landCover,
  };
}
