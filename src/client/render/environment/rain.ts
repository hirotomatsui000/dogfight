import { BufferAttribute, BufferGeometry, LineSegments, type Scene, ShaderMaterial, Vector3 } from 'three';
import { Rng } from '../../../shared/math/rng.ts';

const DROPS = 3000;
const BOX_M = 240;
/** Rain falls at about 9 m/s. */
const FALL_MS = 9;

const VERTEX = /* glsl */ `
attribute float aEnd;
uniform float uTime;
uniform vec3 uRelative;
uniform float uBox;
varying float vEnd;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  // Each drop wraps around a box that follows the camera; the streak points along the air's motion past it.
  vec3 p = mod(position + uRelative * uTime + uBox * 0.5, uBox) - uBox * 0.5;
  p += uRelative * 0.06 * aEnd;
  vEnd = aEnd;
  vec4 mvPosition = modelViewMatrix * vec4(p, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform float uOpacity;
varying float vEnd;
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  gl_FragColor = vec4(vec3(0.75, 0.78, 0.82), uOpacity * (0.3 + 0.7 * vEnd));
}`;

/** Light rain below the cloud base (weather "Rain"): streaks that follow the camera and slant with its speed. */
export class Rain {
  private readonly lines: LineSegments;
  private readonly material: ShaderMaterial;
  private readonly relative = new Vector3();
  private time = 0;

  constructor(scene: Scene) {
    const rng = new Rng(77);
    const positions = new Float32Array(DROPS * 2 * 3);
    const ends = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i++) {
      const p = [rng.range(-BOX_M / 2, BOX_M / 2), rng.range(-BOX_M / 2, BOX_M / 2), rng.range(-BOX_M / 2, BOX_M / 2)];
      positions.set(p, i * 6);
      positions.set(p, i * 6 + 3);
      ends[i * 2 + 1] = 1;
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setAttribute('aEnd', new BufferAttribute(ends, 1));
    this.material = new ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uRelative: { value: this.relative }, uBox: { value: BOX_M }, uOpacity: { value: 0.35 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
    });
    this.lines = new LineSegments(g, this.material);
    this.lines.frustumCulled = false;
    this.lines.name = 'rain';
    this.lines.visible = false;
    scene.add(this.lines);
  }

  /** `cameraVelocity` makes the streaks rush past a fast jet. */
  update(dt: number, camera: Vector3, cameraVelocity: Vector3, raining: boolean, light: number): void {
    this.lines.visible = raining;
    if (!raining) return;
    this.time = (this.time + dt) % 1000;
    this.relative.set(-cameraVelocity.x, -FALL_MS - cameraVelocity.y, -cameraVelocity.z);
    this.lines.position.copy(camera);
    this.material.uniforms.uTime.value = this.time;
    this.material.uniforms.uOpacity.value = 0.2 + 0.35 * light;
  }

  dispose(): void {
    this.lines.removeFromParent();
    this.lines.geometry.dispose();
    this.material.dispose();
  }
}
