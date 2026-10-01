import { BufferAttribute, BufferGeometry, Color, DoubleSide, DynamicDrawUsage, Mesh, NormalBlending, ShaderMaterial, type Vector3 } from 'three';
import type { ParticleFrame } from './particles.ts';

/** How a family of trails looks and lasts. */
export interface TrailLook {
  /** seconds a point lives */
  lifeS: number;
  /** a new point at most this often */
  sampleS: number;
  /** width at birth and at the end of life, metres */
  width0: number;
  width1: number;
  /** peak opacity */
  alpha: number;
  /** seconds over which a new point fades in (0 = born at full strength) */
  fadeInS: number;
  /** points kept per trail */
  maxPoints: number;
  color: Color;
}

interface TrailPoint {
  x: number;
  y: number;
  z: number;
  t: number;
  /** how strong the emitter was here, 0..1 */
  a: number;
}

interface Trail {
  points: TrailPoint[];
  /** the emitter's position now: the trail runs up to it between samples */
  head: TrailPoint | null;
  lastEmitS: number;
}

/**
 * The bookkeeping of ribbon trails (M5: contrails and wingtip vapour): points sampled from each emitter, aged out after
 * their life. An emitter that pauses starts a new trail when it resumes, so the gap is not bridged.
 */
export class TrailStore {
  readonly look: TrailLook;
  private readonly live = new Map<string, Trail>();
  private readonly fading: Trail[] = [];

  constructor(look: TrailLook) {
    this.look = look;
  }

  /** An emitter at `p` with strength `a` (0 stops it) at time `t`. */
  emit(key: string, p: { x: number; y: number; z: number }, a: number, t: number): void {
    let trail = this.live.get(key);
    if (a <= 0) {
      if (trail) this.retire(key, trail);
      return;
    }
    if (trail && t - trail.lastEmitS > this.pauseS) {
      this.retire(key, trail);
      trail = undefined;
    }
    if (!trail) {
      trail = { points: [], head: null, lastEmitS: t };
      this.live.set(key, trail);
    }
    trail.lastEmitS = t;
    const last = trail.points.at(-1);
    if (!last || t - last.t >= this.look.sampleS) {
      trail.points.push({ x: p.x, y: p.y, z: p.z, t, a });
      if (trail.points.length > this.look.maxPoints) trail.points.shift();
      trail.head = null;
    } else {
      trail.head = { x: p.x, y: p.y, z: p.z, t, a };
    }
  }

  /** Drops points past their life and trails that have none left (or whose emitter went quiet). */
  age(t: number): void {
    const life = this.look.lifeS;
    for (const [key, trail] of this.live) {
      if (t - trail.lastEmitS > this.pauseS) this.retire(key, trail);
    }
    for (const trail of [...this.live.values(), ...this.fading]) {
      while (trail.points.length > 0 && t - trail.points[0].t > life) trail.points.shift();
    }
    for (let i = this.fading.length - 1; i >= 0; i--) if (this.fading[i].points.length < 2) this.fading.splice(i, 1);
  }

  /** Every trail's points from oldest to newest, the head last, for drawing. */
  *trails(): Iterable<readonly TrailPoint[]> {
    for (const trail of this.live.values()) yield trail.head ? [...trail.points, trail.head] : trail.points;
    for (const trail of this.fading) yield trail.points;
  }

  get count(): number {
    return this.live.size + this.fading.length;
  }

  /** An emitter quiet this long has stopped; slow frames (up to a quarter second) never count as a pause. */
  private get pauseS(): number {
    return Math.max(3 * this.look.sampleS, 0.3);
  }

  clear(): void {
    this.live.clear();
    this.fading.length = 0;
  }

  private retire(key: string, trail: Trail): void {
    this.live.delete(key);
    trail.head = null;
    if (trail.points.length >= 2) this.fading.push(trail);
  }
}

const VERTEX = /* glsl */ `
attribute vec3 aTangent;
attribute float aSide;
attribute float aWidth;
attribute float aAlpha;
varying float vAlpha;
varying float vSide;
varying float vDepth;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 t = normalize((modelViewMatrix * vec4(aTangent, 0.0)).xyz + vec3(1e-6));
  vec3 across = normalize(cross(t, normalize(-mv.xyz)) + vec3(1e-6));
  mv.xyz += across * aWidth * 0.5 * aSide;
  vAlpha = aAlpha;
  vSide = aSide;
  vDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
  #include <logdepthbuf_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uColor;
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uLight;
varying float vAlpha;
varying float vSide;
varying float vDepth;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  float edge = 1.0 - vSide * vSide;
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  vec3 color = mix(uColor * uLight, uFogColor, fog);
  // Fade out right at the camera, so a trail flown through does not fill the screen.
  float near = smoothstep(2.0, 12.0, vDepth);
  gl_FragColor = vec4(color, vAlpha * edge * near);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const FLOATS_PER_VERTEX = 3 + 3 + 1 + 1 + 1;

/**
 * Camera-facing ribbons drawn from a TrailStore, one draw call for all of them: each segment between two points is a
 * quad that widens and fades with age.
 */
export class TrailRibbons {
  readonly mesh: Mesh;
  readonly store: TrailStore;
  private readonly capacity: number;
  private readonly pos: Float32Array;
  private readonly tangent: Float32Array;
  private readonly side: Float32Array;
  private readonly width: Float32Array;
  private readonly alpha: Float32Array;
  private readonly geometry = new BufferGeometry();
  private readonly material: ShaderMaterial;

  /** `maxSegments`: segments drawn at most per frame. */
  constructor(look: TrailLook, maxSegments: number) {
    this.store = new TrailStore(look);
    this.capacity = maxSegments * 6;
    this.pos = new Float32Array(this.capacity * 3);
    this.tangent = new Float32Array(this.capacity * 3);
    this.side = new Float32Array(this.capacity);
    this.width = new Float32Array(this.capacity);
    this.alpha = new Float32Array(this.capacity);
    const dyn = (a: Float32Array, n: number) => new BufferAttribute(a, n).setUsage(DynamicDrawUsage);
    this.geometry.setAttribute('position', dyn(this.pos, 3));
    this.geometry.setAttribute('aTangent', dyn(this.tangent, 3));
    this.geometry.setAttribute('aSide', dyn(this.side, 1));
    this.geometry.setAttribute('aWidth', dyn(this.width, 1));
    this.geometry.setAttribute('aAlpha', dyn(this.alpha, 1));
    this.material = new ShaderMaterial({
      uniforms: { uColor: { value: look.color.clone() }, uFogColor: { value: new Color() }, uFogDensity: { value: 0 }, uLight: { value: 1 } },
      vertexShader: VERTEX,
      fragmentShader: FRAGMENT,
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      // The ribbon turns to face the camera, so which way its triangles wind depends on the view.
      side: DoubleSide,
    });
    this.mesh = new Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
  }

  /** Bytes the ribbons upload per frame at most (budget checks). */
  get floatsPerFrame(): number {
    return this.capacity * FLOATS_PER_VERTEX;
  }

  update(t: number, frame: ParticleFrame, light: number): void {
    const look = this.store.look;
    this.store.age(t);
    let v = 0;
    const put = (p: TrailPoint, tx: number, ty: number, tz: number, s: number) => {
      const k = Math.min(1, (t - p.t) / look.lifeS);
      this.pos[v * 3] = p.x;
      this.pos[v * 3 + 1] = p.y;
      this.pos[v * 3 + 2] = p.z;
      this.tangent[v * 3] = tx;
      this.tangent[v * 3 + 1] = ty;
      this.tangent[v * 3 + 2] = tz;
      this.side[v] = s;
      this.width[v] = look.width0 + (look.width1 - look.width0) * Math.sqrt(k);
      // A fade-in at the emitter (contrails form a little behind the engines), a long fade-out with age.
      const fadeIn = look.fadeInS > 0 ? Math.min(1, (t - p.t) / look.fadeInS + 0.1) : 1;
      this.alpha[v] = look.alpha * p.a * (1 - k) * (1 - k) * fadeIn;
      v++;
    };
    outer: for (const pts of this.store.trails()) {
      for (let i = 0; i + 1 < pts.length; i++) {
        if (v + 6 > this.capacity) break outer;
        const a = pts[i];
        const b = pts[i + 1];
        const tx = b.x - a.x;
        const ty = b.y - a.y;
        const tz = b.z - a.z;
        put(a, tx, ty, tz, -1);
        put(a, tx, ty, tz, 1);
        put(b, tx, ty, tz, -1);
        put(b, tx, ty, tz, -1);
        put(a, tx, ty, tz, 1);
        put(b, tx, ty, tz, 1);
      }
    }
    this.geometry.setDrawRange(0, v);
    for (const name of ['position', 'aTangent', 'aSide', 'aWidth', 'aAlpha']) this.geometry.getAttribute(name).needsUpdate = true;
    const u = this.material.uniforms;
    (u.uFogColor.value as Color).copy(frame.fogColor);
    u.uFogDensity.value = frame.fogDensity;
    u.uLight.value = light;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}

/** The jet's load factor from two velocity samples (for jets whose flight state is interpolated, online). */
export function loadFactorFromVelocity(prev: Vector3, vel: Vector3, dt: number, upX: number, upY: number, upZ: number): number {
  if (dt <= 0) return 1;
  const ax = (vel.x - prev.x) / dt;
  const ay = (vel.y - prev.y) / dt + 9.80665;
  const az = (vel.z - prev.z) / dt;
  return (ax * upX + ay * upY + az * upZ) / 9.80665;
}
