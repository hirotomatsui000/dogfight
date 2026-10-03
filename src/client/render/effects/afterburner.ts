import { BackSide, CustomBlending, CylinderGeometry, Mesh, OneFactor, OneMinusSrcAlphaFactor, ShaderMaterial, UniformsLib, UniformsUtils } from 'three';
import { AFTERBURNER_THROTTLE } from '../../../shared/data/weapons.ts';

/** The flame's box is this many nozzle radii wide, room for the plume's widest, most ragged part. */
const BOUNDS_PER_NOZZLE_RADIUS = 1.5;

/** How far the afterburner is lit from the spooled throttle: 0 off .. 1 full. */
export function afterburnerLevel(throttle: number): number {
  return Math.min(1, Math.max(0, (throttle - AFTERBURNER_THROTTLE) / (1 - AFTERBURNER_THROTTLE)));
}

/** The visible plume's length: from 2.5 nozzle diameters when it lights to 7.5 at full afterburner. */
export function plumeLengthM(nozzleRadiusM: number, level: number): number {
  return 2 * nozzleRadiusM * (2.5 + 5 * level);
}

const VERTEX = /* glsl */ `
varying vec3 vObject;
varying vec3 vCamera;
#include <common>
#include <fog_pars_vertex>
#include <logdepthbuf_pars_vertex>
void main() {
  vObject = position;
  vCamera = (inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  gl_Position = projectionMatrix * mvPosition;
  #include <logdepthbuf_vertex>
  #include <fog_vertex>
}`;

/*
 * The flame is a glowing gas, so each pixel adds up the light along its view ray through the plume: a white-hot core
 * at the nozzle, the shock diamonds of the supersonic jet behind it, and a turbulent mantle that cools from yellow to
 * red as it mixes with the air and breaks up at the tail. A lightly lit afterburner burns a thin, pale blue; more fuel
 * turns it orange and dense enough to dim the sky behind it.
 * Positions are in the box's own space (radius 1, length 0..1) and in metres for the shapes.
 */
const FRAGMENT = /* glsl */ `
uniform float uTime;
uniform float uLevel;
uniform float uSeed;
uniform float uBoundsM;
uniform float uLengthM;
uniform float uNozzleM;
varying vec3 vObject;
varying vec3 vCamera;
#include <common>
#include <fog_pars_fragment>
#include <logdepthbuf_pars_fragment>

const int STEPS = 20;

float hash(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}

float noise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(mix(hash(i), hash(i + vec3(1, 0, 0)), f.x), mix(hash(i + vec3(0, 1, 0)), hash(i + vec3(1, 1, 0)), f.x), f.y),
    mix(mix(hash(i + vec3(0, 0, 1)), hash(i + vec3(1, 0, 1)), f.x), mix(hash(i + vec3(0, 1, 1)), hash(i + vec3(1, 1, 1)), f.x), f.y),
    f.z);
}

/** 1 well inside \`radius\`, fading to 0 at its edge (0 everywhere when the radius is 0). */
float inside(float r, float radius) {
  return radius <= 0.0 ? 0.0 : 1.0 - smoothstep(radius * 0.25, radius, r);
}

/**
 * The flame at p (metres; z aft from the nozzle exit): rgb is the light it gives off per metre of path, a how much of
 * the view behind the flame a metre of it hides.
 */
vec4 flame(vec3 p) {
  float rn = uNozzleM;
  float r = length(p.xy);
  float u = p.z / uLengthM;
  float lit = smoothstep(0.0, 0.3, uLevel);

  // Turbulence streams aft with the gas in long streaks: smooth at the nozzle, growing into eddies downstream.
  vec3 q = p / rn;
  float swirl = noise(vec3(q.xy * 1.1, q.z * 0.4 - uTime * 9.0) + uSeed);
  float fine = noise(vec3(q.xy * 3.3, q.z * 1.0 - uTime * 21.0) + uSeed * 1.7);
  float stir = smoothstep(0.0, 0.6, u);
  float turb = mix(0.5, 0.6 * swirl + 0.4 * fine, 0.4 + 0.6 * stir);

  // Mantle: the nozzle's width, tapering to the tail and breaking up there into ragged tongues.
  float edge = rn * (1.0 + 0.3 * u) * pow(1.0 - u, 0.6) * (0.8 + 0.4 * turb);
  float tongues = smoothstep(u - 0.3, u + 0.1, swirl + 0.15);
  float mantle = pow(clamp(1.0 - (r * r) / (edge * edge + 1e-4), 0.0, 1.0), 0.6) * sqrt(1.0 - u) * (0.5 + turb) * tongues;
  vec3 near = mix(vec3(0.45, 0.5, 1.0), vec3(1.0, 0.52, 0.13), lit);
  vec3 tail = mix(vec3(0.7, 0.35, 0.7), vec3(1.0, 0.3, 0.06), lit);
  vec3 light = mantle * mix(near, tail, smoothstep(0.1, 0.75, u)) * 0.65;

  // Inner flame: the hot jet running down the middle, white at the nozzle.
  float innerLength = 0.55 * uLengthM;
  float inner = inside(r, rn * 0.7 * max(1.0 - p.z / innerLength, 0.0)) * tongues;
  float white = 1.0 - smoothstep(0.0, rn * (1.2 + 1.6 * uLevel), p.z);
  light += inner * mix(mix(vec3(0.5, 0.6, 1.0), vec3(1.0, 0.64, 0.24), lit), vec3(1.0, 0.88, 0.7), white) * (0.7 + 1.5 * white);

  // Shock diamonds: bright knots about a nozzle diameter apart inside the jet, fading down the plume.
  float spacing = rn * (2.0 + 0.8 * uLevel);
  float phase = p.z / spacing - 0.7;
  float k = 1.0 - 2.0 * abs(fract(phase + 0.5) - 0.5);
  float diamond = inside(r, rn * 0.55 * k) * k * step(-0.5, phase) * (1.0 - smoothstep(0.2, 0.6, u)) * tongues;
  light += diamond * mix(vec3(0.75, 0.8, 1.0), vec3(1.0, 0.85, 0.55), lit) * 2.6;

  return vec4(light * (0.45 + 0.55 * uLevel), (mantle + inner) * 0.9 * lit);
}

void main() {
  #include <logdepthbuf_fragment>
  // The view ray from the camera to this back face, entering the box at the near side of the cylinder or an end.
  vec3 ro = vCamera;
  vec3 rd = vObject - vCamera;
  float tFar = length(rd);
  rd /= tFar;
  float tNear = 0.0;
  float a = dot(rd.xy, rd.xy);
  if (a > 1e-6) {
    float b = dot(ro.xy, rd.xy);
    float c = dot(ro.xy, ro.xy) - 1.0;
    float h = b * b - a * c;
    if (h > 0.0) tNear = max(tNear, (-b - sqrt(h)) / a);
  }
  if (abs(rd.z) > 1e-6) tNear = max(tNear, min(-ro.z / rd.z, (1.0 - ro.z) / rd.z));
  if (tNear >= tFar) discard;

  vec3 scale = vec3(uBoundsM, uBoundsM, uLengthM);
  float dt = (tFar - tNear) / float(STEPS);
  float stepM = length(rd * scale) * dt;
  // A per-pixel offset hides the steps as fine grain.
  float t = tNear + dt * fract(52.9829189 * fract(dot(gl_FragCoord.xy, vec2(0.06711056, 0.00583715))));
  vec3 light = vec3(0.0);
  // The gas is thin enough that its own light passes through it, but a full afterburner dims the sky behind it a little.
  float opacity = 0.0;
  for (int i = 0; i < STEPS; i++) {
    vec3 p = (ro + rd * t) * scale;
    if (p.z >= 0.0 && dot(p.xy, p.xy) < uNozzleM * uNozzleM * 2.0) {
      vec4 f = flame(p);
      light += f.rgb * stepM;
      opacity += f.a * stepM;
    }
    t += dt;
  }
  light *= 1.0 + 0.06 * sin(uTime * 53.0 + uSeed) + 0.04 * sin(uTime * 97.0 + uSeed * 1.3);
  float seen = 1.0;
  #ifdef USE_FOG
    #ifdef FOG_EXP2
      seen = exp(-fogDensity * fogDensity * vFogDepth * vFogDepth);
    #else
      seen = 1.0 - smoothstep(fogNear, fogFar, vFogDepth);
    #endif
  #endif
  gl_FragColor = vec4(light * seen, (1.0 - exp(-opacity)) * seen);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

let seeds = 0;

function flameMaterial(nozzleRadiusM: number): ShaderMaterial {
  return new ShaderMaterial({
    uniforms: UniformsUtils.merge([
      UniformsLib.fog,
      {
        uTime: { value: 0 },
        uLevel: { value: 0 },
        uSeed: { value: (seeds++ * 7.31) % 61 },
        uBoundsM: { value: nozzleRadiusM * BOUNDS_PER_NOZZLE_RADIUS },
        uLengthM: { value: 1 },
        uNozzleM: { value: nozzleRadiusM },
      },
    ]),
    vertexShader: VERTEX,
    fragmentShader: FRAGMENT,
    transparent: true,
    depthWrite: false,
    // Premultiplied: the flame's light is added, and the background dims by the flame's opacity.
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    // The ray is traced from each back face, so the flame still draws with the camera inside it.
    side: BackSide,
    fog: true,
  });
}

/** One unit box per flame shape: radius 1, from the nozzle exit (z 0) aft to z 1. */
const box = new CylinderGeometry(1, 1, 1, 20, 1, false).rotateX(Math.PI / 2).translate(0, 0, 0.5);

/**
 * An afterburner flame pointing aft (+z) from a nozzle exit of this radius, hidden until `setAfterburner` lights it.
 * Each flame has its own material, so every jet burns at its own level.
 */
export function createAfterburner(nozzleRadiusM: number): Mesh {
  const flame = new Mesh(box, flameMaterial(nozzleRadiusM));
  flame.name = 'afterburner';
  flame.visible = false;
  return flame;
}

/** `Object3D.clone` shares materials: gives a copied flame its own again. */
export function unshareAfterburner(flame: Mesh): void {
  const material = (flame.material as ShaderMaterial).clone();
  material.uniforms.uSeed.value = (seeds++ * 7.31) % 61;
  flame.material = material;
}

/** Lights the flame at `level` (0 hides it); `timeS` moves its flicker and turbulence. */
export function setAfterburner(flame: Mesh, level: number, timeS: number): void {
  flame.visible = level > 0;
  if (level <= 0) return;
  const u = (flame.material as ShaderMaterial).uniforms;
  const nozzle = u.uNozzleM.value as number;
  const seed = u.uSeed.value as number;
  const flicker = 1 + 0.05 * Math.sin(timeS * 31 + seed) + 0.03 * Math.sin(timeS * 73 + seed * 2);
  const length = plumeLengthM(nozzle, level) * flicker;
  const bounds = u.uBoundsM.value as number;
  flame.scale.set(bounds, bounds, length);
  u.uLengthM.value = length;
  u.uLevel.value = level;
  u.uTime.value = timeS;
}
