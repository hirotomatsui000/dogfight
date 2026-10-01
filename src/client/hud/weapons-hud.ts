import type { WeaponSelect } from '../../shared/physics/controls.ts';
import type { SeekerMode } from '../../shared/targeting/ir-seeker.ts';
import type { RadarLockMode } from '../../shared/targeting/radar-lock.ts';
import type { AircraftView } from '../session/game-session.ts';

export type Tone = 'normal' | 'amber' | 'red';

export interface WeaponCell {
  text: string;
  /** the selected missile, drawn boxed */
  selected: boolean;
}

/** The weapons readout: stores in a row, and the selected missile's lock state under it. */
export interface WeaponsLine {
  cells: WeaponCell[];
  status: { text: string; tone: Tone };
}

const SEEKER_STATUS: Record<SeekerMode, [string, Tone]> = { off: ['', 'normal'], search: ['SRCH', 'normal'], track: ['TRK', 'amber'], locked: ['LOCK', 'red'] };
const RADAR_STATUS: Record<RadarLockMode, [string, Tone]> = { off: ['', 'normal'], search: ['SRCH', 'normal'], tracking: ['TRK', 'amber'], locked: ['LOCK', 'red'] };

/** GUN · SRM · MRM · CM (· BMB), with the selected missile boxed and its seeker or radar-lock state. */
export function weaponsLine(view: Pick<AircraftView, 'stores' | 'bombLoad' | 'seeker' | 'radarLock'>, weapon: WeaponSelect): WeaponsLine {
  const s = view.stores;
  const cells: WeaponCell[] = [
    { text: `GUN ${s.cannonRounds}`, selected: false },
    { text: `SRM ${s.srm}`, selected: weapon === 'srm' },
    { text: `MRM ${s.mrm}`, selected: weapon === 'mrm' },
    { text: `CM ${s.countermeasures}`, selected: false },
  ];
  if (view.bombLoad > 0) cells.push({ text: `BMB ${s.bombs}`, selected: false });
  const name = weapon === 'srm' ? 'SRM' : 'MRM';
  if ((weapon === 'srm' ? s.srm : s.mrm) <= 0) return { cells, status: { text: `${name} EMPTY`, tone: 'normal' } };
  const [label, tone] = weapon === 'srm' ? SEEKER_STATUS[view.seeker.mode] : RADAR_STATUS[view.radarLock.mode];
  return { cells, status: { text: label ? `${name} ${label}` : name, tone } };
}

/** Half-size of the radar-lock diamond around the target box: it closes in from 3× the box as the lock builds. */
export function lockDiamondPx(boxHalfPx: number, progress: number): number {
  const p = Math.min(1, Math.max(0, progress));
  return boxHalfPx * (1.4 + 1.6 * (1 - p));
}
