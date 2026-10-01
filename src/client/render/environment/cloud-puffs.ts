import { Rng } from '../../../shared/math/rng.ts';
import type { CloudField } from '../../../shared/world/weather.ts';

/** One soft billboard of a cumulus cloud. */
export interface Puff {
  x: number;
  y: number;
  z: number;
  /** radius, metres */
  size: number;
  /** 0 at the cloud base … 1 at its top, for shading */
  shade: number;
}

/** Clouds are laid out in cells of this size; each cell holds at most one clump. */
export const CLOUD_CELL_M = 1600;

function cellSeed(ci: number, cj: number): number {
  return (Math.imul(ci, 73856093) ^ Math.imul(cj, 19349663) ^ 0x5bd1e995) >>> 0;
}

/**
 * The puffs of one cell's cumulus clump, placed where the shared cloud field has cloud (so what the player sees is
 * what blocks sight lines): bigger and taller where the cover is denser, with flat bases. Deterministic per cell.
 */
export function cellPuffs(field: CloudField, ci: number, cj: number): Puff[] {
  const p = field.preset;
  if (p.coverage <= 0 || p.deck) return [];
  const cx = (ci + 0.5) * CLOUD_CELL_M;
  const cz = (cj + 0.5) * CLOUD_CELL_M;
  const c = field.coverAt(cx, cz);
  if (c < 0.2) return [];
  const rng = new Rng(cellSeed(ci, cj));
  const count = Math.round(4 + 10 * c);
  const top = field.topAt(c);
  const base = p.cloudBaseM;
  const out: Puff[] = [];
  for (let k = 0; k < count; k++) {
    const x = cx + rng.range(-0.55, 0.55) * CLOUD_CELL_M;
    const z = cz + rng.range(-0.55, 0.55) * CLOUD_CELL_M;
    const local = field.coverAt(x, z);
    if (local < 0.15) continue;
    const size = (220 + 420 * local) * rng.range(0.75, 1.2);
    const t = Math.pow(rng.next(), 0.8);
    const y = base + size * 0.45 + Math.max(0, top - base - size * 0.9) * t;
    out.push({ x, y, z, size, shade: Math.min(1, (y - base) / Math.max(1, top - base)) });
  }
  return out;
}
