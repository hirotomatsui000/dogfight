import { Quaternion, Vector3 } from 'three';
import { getAircraft } from '../../shared/data/aircraft/registry.ts';
import { buildTerrain, type MapDefinition } from '../../shared/data/maps/map-definition.ts';
import type { Terrain } from '../../shared/map/terrain.ts';
import type { GameMode, ModeStatus } from '../../shared/modes/mode.ts';
import type { ControlInput } from '../../shared/physics/controls.ts';
import type { GameEvent } from '../../shared/world/events.ts';
import { DT, World } from '../../shared/world/world.ts';
import { FixedStepper } from './fixed-stepper.ts';
import type { AircraftView, GameSession } from './game-session.ts';

export interface LocalSessionOptions {
  map: MapDefinition;
  mode: GameMode;
  aircraftId: string;
  callsign: string;
  seed?: number;
  /** reuse an already built terrain (tests, restarts) */
  terrain?: Terrain;
}

interface PreviousPose {
  pos: Vector3;
  quat: Quaternion;
  spawnGen: number;
}

/** Runs the authoritative World inside the browser (single player, M1). */
export class LocalSession implements GameSession {
  readonly world: World;
  readonly map: MapDefinition;
  readonly terrain: Terrain;
  readonly localId: number;
  private readonly stepper = new FixedStepper(DT);
  private readonly inputs = new Map<number, ControlInput>();
  private readonly previous = new Map<number, PreviousPose>();
  private readonly viewCache = new Map<number, AircraftView>();
  private pendingEvents: GameEvent[] = [];

  constructor(opts: LocalSessionOptions) {
    this.map = opts.map;
    this.terrain = opts.terrain ?? buildTerrain(opts.map);
    this.world = new World({ map: opts.map, terrain: this.terrain, mode: opts.mode, seed: opts.seed ?? 1 });
    const config = getAircraft(opts.aircraftId);
    this.localId = this.world.addAircraft({ callsign: opts.callsign, team: config.team, aircraftId: config.id }).id;
    this.pendingEvents.push(...this.world.drainEvents());
  }

  update(frameDtS: number, input: ControlInput): void {
    this.inputs.set(this.localId, input);
    this.stepper.advance(frameDtS, () => {
      this.capturePrevious();
      this.world.step(this.inputs);
      this.pendingEvents.push(...this.world.drainEvents());
    });
    this.refreshViews();
  }

  views(): Iterable<AircraftView> {
    return this.viewCache.values();
  }

  localView(): AircraftView | null {
    return this.viewCache.get(this.localId) ?? null;
  }

  drainEvents(): GameEvent[] {
    const drained = this.pendingEvents;
    this.pendingEvents = [];
    return drained;
  }

  modeStatus(): ModeStatus {
    return this.world.mode.status(this.world);
  }

  dispose(): void {
    this.viewCache.clear();
    this.previous.clear();
  }

  private capturePrevious(): void {
    for (const a of this.world.aircraftList()) {
      let prev = this.previous.get(a.id);
      if (!prev) {
        prev = { pos: new Vector3(), quat: new Quaternion(), spawnGen: a.spawnGen };
        this.previous.set(a.id, prev);
      }
      prev.pos.copy(a.flight.pos);
      prev.quat.copy(a.flight.quat);
      prev.spawnGen = a.spawnGen;
    }
  }

  private refreshViews(): void {
    const alpha = this.stepper.alpha;
    const seen = new Set<number>();
    for (const a of this.world.aircraftList()) {
      seen.add(a.id);
      let view = this.viewCache.get(a.id);
      if (!view) {
        view = {
          id: a.id,
          callsign: a.callsign,
          team: a.team,
          config: a.config,
          isLocal: a.id === this.localId,
          isBot: a.isBot,
          alive: a.alive,
          hp: a.hp,
          spawnGen: a.spawnGen,
          position: a.flight.pos.clone(),
          quaternion: a.flight.quat.clone(),
          flight: a.flight,
          boundarySecondsLeft: null,
        };
        this.viewCache.set(a.id, view);
      }
      const prev = this.previous.get(a.id);
      if (prev && prev.spawnGen === a.spawnGen) {
        view.position.lerpVectors(prev.pos, a.flight.pos, alpha);
        view.quaternion.slerpQuaternions(prev.quat, a.flight.quat, alpha);
      } else {
        view.position.copy(a.flight.pos);
        view.quaternion.copy(a.flight.quat);
      }
      view.alive = a.alive;
      view.hp = a.hp;
      view.spawnGen = a.spawnGen;
      view.flight = a.flight;
      view.boundarySecondsLeft = this.world.boundarySecondsLeft(a);
    }
    for (const id of this.viewCache.keys()) if (!seen.has(id)) this.viewCache.delete(id);
  }
}
