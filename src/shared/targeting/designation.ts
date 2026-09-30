import { DEG } from '../math/units.ts';
import type { Contact } from './sensors.ts';

/** Contacts the target-cycle key can pick: those within 90° of the nose. */
export const CYCLE_MAX_OFF_NOSE_RAD = 90 * DEG;
/** With nothing designated, a contact within 60° of the nose is designated automatically. */
export const AUTO_DESIGNATE_MAX_OFF_NOSE_RAD = 60 * DEG;

/** Contacts ahead, sorted by angle off the nose, then by range (spec §10.3). */
export function designationOrder(contacts: readonly Contact[]): Contact[] {
  return contacts
    .filter((c) => c.offNoseRad <= CYCLE_MAX_OFF_NOSE_RAD)
    .sort((a, b) => a.offNoseRad - b.offNoseRad || a.rangeM - b.rangeM);
}

export function isContact(id: number | null, contacts: readonly Contact[]): boolean {
  return id !== null && contacts.some((c) => c.id === id);
}

/** The target after `currentId` in designation order (wrapping). With nothing ahead, keeps a still-valid target. */
export function cycleDesignation(currentId: number | null, contacts: readonly Contact[]): number | null {
  const order = designationOrder(contacts);
  if (order.length === 0) return isContact(currentId, contacts) ? currentId : null;
  const i = order.findIndex((c) => c.id === currentId);
  return order[(i + 1) % order.length].id;
}

/** The contact closest to the nose, if one is within the auto-designation cone. */
export function autoDesignate(contacts: readonly Contact[]): number | null {
  let best: Contact | null = null;
  for (const c of contacts) {
    if (c.offNoseRad > AUTO_DESIGNATE_MAX_OFF_NOSE_RAD) continue;
    if (!best || c.offNoseRad < best.offNoseRad) best = c;
  }
  return best ? best.id : null;
}
