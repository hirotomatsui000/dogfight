import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { SteadyWind } from '../../../shared/physics/wind.ts';

export interface ParticleSpawn {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  lifeS: number;
  /** diameter in meters at birth and at the end of life */
  size0: number;
  size1: number;
  /** linear color */
  color: Color;
  alpha: number;
  /** vertical acceleration, m/s² (+ rises like hot smoke, − falls) */
  lift?: number;
  /** fraction of velocity lost per second */
  drag?: number;
}

const VERTEX = /* glsl */ `
uniform float uPixelScale;
uniform float uMinPointSize;
attribute float aSize;
attribute vec4 aColor;
varying vec4 vColor;
varying float vDepth;
#include <common>
#include <logdepthbuf_pars_vertex>
void main() {
  vColor = aColor;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vDepth = -mvPosition.z;
  gl_PointSize = clamp(aSize * uPixelScale / max(vDepth, 1.0), uMinPointSize, 384.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
}`;

const FRAGMENT = /* glsl */ `
uniform vec3 uFogColor;
uniform float uFogDensity;
uniform float uAdditive;
varying vec4 vColor;
varying float vDepth;
#include <common>
#include <logdepthbuf_pars_fragment>
void main() {
  #include <logdepthbuf_fragment>
  vec2 c = gl_PointCoord * 2.0 - 1.0;
  float d = dot(c, c);
  if (d > 1.0) discard;
  float soft = (1.0 - d) * (1.0 - d);
  float fog = 1.0 - exp(-uFogDensity * uFogDensity * vDepth * vDepth);
  // Smoke fades into the haze color; glowing particles just fade out.
  vec3 color = mix(vColor.rgb, uFogColor, fog * (1.0 - uAdditive));
  // Particles right at the camera (own missile launch, passing flares) would cover the screen: fade them out.
  float near = smoothstep(3.0, 15.0, vDepth);
  gl_FragColor = vec4(color, vColor.a * soft * near * (1.0 - fog * uAdditive));
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

/**
 * Glowing particles (motor flames, flares, flashes) stay at least this many framebuffer pixels wide, so a far missile
 * or a flare shows as a bright point instead of vanishing (spec §15.4).
 */
const GLOW_MIN_POINT_PX = 4;

/** Soft round camera-facing sprites that respect the log depth buffer and the haze. */
export function createParticleMaterial(additive: boolean): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: {
      uPixelScale: { value: 1000 },
      uMinPointSize: { value: additive ? GLOW_MIN_POINT_PX : 0 },
      uFogColor: { value: new Color() },
      uFogDensity: { value: 0 },
      uAdditive: { value: additive ? 1 : 0 },
    },
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    blending: additive ? AdditiveBlending : NormalBlending,
  });
}

export function applyParticleFrame(material: ShaderMaterial, frame: ParticleFrame): void {
  const u = material.uniforms;
  u.uPixelScale.value = frame.pixelScale;
  (u.uFogColor.value as Color).copy(frame.fogColor);
  u.uFogDensity.value = frame.fogDensity;
}

export interface ParticleFrame {
  /** framebuffer pixels per meter at 1 m distance: bufferHeight / (2·tan(fov/2)) */
  pixelScale: number;
  fogColor: Color;
  fogDensity: number;
  /** smoke and trails drift with it (revision 16) */
  wind?: SteadyWind;
}

const windTmp = new Vector3();

/** A fixed pool of particles simulated on the CPU; the oldest particle is reused when the pool is full. */
export class ParticleSystem {
  readonly points: Points;
  readonly capacity: number;
  private next = 0;
  private readonly position: Float32Array;
  private readonly velocity: Float32Array;
  private readonly rgba: Float32Array;
  private readonly baseColor: Float32Array;
  private readonly size: Float32Array;
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly size0: Float32Array;
  private readonly size1: Float32Array;
  private readonly alpha: Float32Array;
  private readonly lift: Float32Array;
  private readonly drag: Float32Array;
  private readonly material: ShaderMaterial;
  private readonly geometry = new BufferGeometry();

  constructor(capacity: number, additive: boolean) {
    this.capacity = capacity;
    this.position = new Float32Array(capacity * 3);
    this.velocity = new Float32Array(capacity * 3);
    this.rgba = new Float32Array(capacity * 4);
    this.baseColor = new Float32Array(capacity * 3);
    this.size = new Float32Array(capacity);
    this.age = new Float32Array(capacity);
    this.life = new Float32Array(capacity);
    this.size0 = new Float32Array(capacity);
    this.size1 = new Float32Array(capacity);
    this.alpha = new Float32Array(capacity);
    this.lift = new Float32Array(capacity);
    this.drag = new Float32Array(capacity);
    this.geometry.setAttribute('position', new BufferAttribute(this.position, 3).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aColor', new BufferAttribute(this.rgba, 4).setUsage(DynamicDrawUsage));
    this.geometry.setAttribute('aSize', new BufferAttribute(this.size, 1).setUsage(DynamicDrawUsage));
    this.material = createParticleMaterial(additive);
    this.points = new Points(this.geometry, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 2 : 1;
  }

  /** Particles currently alive. */
  get liveCount(): number {
    let n = 0;
    for (let i = 0; i < this.capacity; i++) if (this.life[i] > 0) n++;
    return n;
  }

  /** Share of spawns kept (graphics presets); thinning is evenly spaced, not random. */
  density = 1;
  private densityCredit = 0;

  spawn(p: ParticleSpawn): void {
    if (this.density < 1) {
      this.densityCredit += this.density;
      if (this.densityCredit < 1) return;
      this.densityCredit -= 1;
    }
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    const i3 = i * 3;
    this.position[i3] = p.x;
    this.position[i3 + 1] = p.y;
    this.position[i3 + 2] = p.z;
    this.velocity[i3] = p.vx;
    this.velocity[i3 + 1] = p.vy;
    this.velocity[i3 + 2] = p.vz;
    this.baseColor[i3] = p.color.r;
    this.baseColor[i3 + 1] = p.color.g;
    this.baseColor[i3 + 2] = p.color.b;
    this.age[i] = 0;
    this.life[i] = p.lifeS;
    this.size0[i] = p.size0;
    this.size1[i] = p.size1;
    this.alpha[i] = p.alpha;
    this.lift[i] = p.lift ?? 0;
    this.drag[i] = p.drag ?? 0;
    this.size[i] = p.size0;
  }

  update(dt: number, frame: ParticleFrame): void {
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      const i3 = i * 3;
      const i4 = i * 4;
      this.age[i] += dt;
      if (this.age[i] >= this.life[i]) {
        this.life[i] = 0;
        this.size[i] = 0;
        this.rgba[i4 + 3] = 0;
        continue;
      }
      const t = this.age[i] / this.life[i];
      const keep = Math.max(0, 1 - this.drag[i] * dt);
      // Drag slows a particle to the air's speed, not to a stop: smoke drifts downwind.
      const air = frame.wind && this.drag[i] > 0 ? frame.wind.steadyAt(this.position[i3 + 1], windTmp) : null;
      const ax = air ? air.x : 0;
      const az = air ? air.z : 0;
      this.velocity[i3] = ax + (this.velocity[i3] - ax) * keep;
      this.velocity[i3 + 1] = this.velocity[i3 + 1] * keep + this.lift[i] * dt;
      this.velocity[i3 + 2] = az + (this.velocity[i3 + 2] - az) * keep;
      this.position[i3] += this.velocity[i3] * dt;
      this.position[i3 + 1] += this.velocity[i3 + 1] * dt;
      this.position[i3 + 2] += this.velocity[i3 + 2] * dt;
      this.size[i] = this.size0[i] + (this.size1[i] - this.size0[i]) * t;
      this.rgba[i4] = this.baseColor[i3];
      this.rgba[i4 + 1] = this.baseColor[i3 + 1];
      this.rgba[i4 + 2] = this.baseColor[i3 + 2];
      // quick fade-in, slow fade-out
      this.rgba[i4 + 3] = this.alpha[i] * Math.min(1, t * 12) * (1 - t) * (1 - t);
    }
    applyParticleFrame(this.material, frame);
    for (const name of ['position', 'aColor', 'aSize']) this.geometry.getAttribute(name).needsUpdate = true;
  }

  dispose(): void {
    this.geometry.dispose();
    this.material.dispose();
  }
}
