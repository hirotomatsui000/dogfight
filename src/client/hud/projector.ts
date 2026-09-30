import { type PerspectiveCamera, Vector3 } from 'three';
import { DEG } from '../../shared/math/units.ts';

export interface ScreenPoint {
  x: number;
  y: number;
}

const FAR = 10000;

/** Projects world points and directions to HUD pixels for the current camera. */
export class Projector {
  width = 0;
  height = 0;
  private readonly camSpace = new Vector3();
  private readonly ndc = new Vector3();
  private readonly world = new Vector3();

  setSize(width: number, height: number): void {
    this.width = width;
    this.height = height;
  }

  /** Camera-space position: x right, y up, z toward the viewer (negative = in front). */
  toCamera(camera: PerspectiveCamera, world: Vector3, out: Vector3): Vector3 {
    return out.copy(world).applyMatrix4(camera.matrixWorldInverse);
  }

  /** Screen pixels of a world point; false when it is behind the camera. */
  point(camera: PerspectiveCamera, world: Vector3, out: ScreenPoint): boolean {
    if (this.toCamera(camera, world, this.camSpace).z > -0.1) return false;
    this.ndc.copy(world).project(camera);
    out.x = (this.ndc.x + 1) * 0.5 * this.width;
    out.y = (1 - this.ndc.y) * 0.5 * this.height;
    return true;
  }

  /** Screen pixels of a direction seen from the camera; false when it points behind. */
  direction(camera: PerspectiveCamera, dir: Vector3, out: ScreenPoint): boolean {
    this.world.copy(camera.position).addScaledVector(dir, FAR);
    return this.point(camera, this.world, out);
  }

  /** Pixels per radian near the screen center, for drawing angular sizes. */
  pixelsPerRadian(camera: PerspectiveCamera): number {
    return this.height / 2 / Math.tan((camera.fov * DEG) / 2);
  }
}
