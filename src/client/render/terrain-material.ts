import { MeshStandardMaterial, type Texture } from 'three';

export interface TerrainTextures {
  farm: Texture;
  forest: Texture;
  mountain: Texture;
  detail: Texture;
}

/**
 * Terrain material that paints real satellite photos by land class (see TerrainMesh's `landClass`/`landExtra`
 * attributes). It extends MeshStandardMaterial so sun, image-based lighting and fog work as usual.
 *
 * Each photo is sampled twice (true scale, and rotated/rescaled) and mixed by low-frequency noise so the tiling
 * doesn't repeat visibly. A close-up detail photo fades in near the camera.
 */
export function createTerrainMaterial(t: TerrainTextures): MeshStandardMaterial {
  const material = new MeshStandardMaterial({ roughness: 0.95, metalness: 0 });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.csFarm = { value: t.farm };
    shader.uniforms.csForest = { value: t.forest };
    shader.uniforms.csMountain = { value: t.mountain };
    shader.uniforms.csDetail = { value: t.detail };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec4 landClass;
attribute vec2 landExtra;
varying vec4 vCsClass;
varying vec2 vCsExtra;
varying vec2 vCsWorldXZ;
varying float vCsViewDist;`,
      )
      .replace(
        '#include <project_vertex>',
        `#include <project_vertex>
vec4 csWorld = modelMatrix * vec4(transformed, 1.0);
vCsWorldXZ = csWorld.xz;
vCsViewDist = distance(csWorld.xyz, cameraPosition);
vCsClass = landClass;
vCsExtra = landExtra;`,
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D csFarm;
uniform sampler2D csForest;
uniform sampler2D csMountain;
uniform sampler2D csDetail;
varying vec4 vCsClass;
varying vec2 vCsExtra;
varying vec2 vCsWorldXZ;
varying float vCsViewDist;

float csHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float csNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(csHash(i), csHash(i + vec2(1.0, 0.0)), u.x), mix(csHash(i + vec2(0.0, 1.0)), csHash(i + vec2(1.0, 1.0)), u.x), u.y);
}
// tileM: ground size of the photo in meters (true scale for the first sample).
vec3 csPhoto(sampler2D tex, vec2 p, float tileM) {
  vec2 uvA = p / tileM;
  vec2 q = mat2(0.7986, -0.6018, 0.6018, 0.7986) * p; // rotated 37 degrees
  vec2 uvB = q / (tileM * 0.73) + vec2(0.37, 0.61);
  float m = smoothstep(0.3, 0.7, csNoise(p / 9000.0));
  return mix(texture2D(tex, uvA).rgb, texture2D(tex, uvB).rgb, m);
}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec3 csColor = csPhoto(csFarm, vCsWorldXZ, 18000.0) * vCsClass.x
  + csPhoto(csForest, vCsWorldXZ, 12000.0) * vCsClass.y
  + csPhoto(csMountain, vCsWorldXZ, 14000.0) * vCsClass.z
  + vec3(0.62, 0.53, 0.33) * vCsClass.w;
csColor = mix(csColor, vec3(0.012, 0.03, 0.045), vCsExtra.x);
csColor = mix(csColor, vec3(0.82, 0.85, 0.9), vCsExtra.y * 0.85);
float csFade = (1.0 - smoothstep(500.0, 2500.0, vCsViewDist)) * (1.0 - vCsExtra.x);
vec3 csDet = texture2D(csDetail, vCsWorldXZ / 35.0).rgb;
vec3 csDetMean = texture2D(csDetail, vec2(0.5), 16.0).rgb;
float csRatio = dot(csDet, vec3(0.2126, 0.7152, 0.0722)) / max(dot(csDetMean, vec3(0.2126, 0.7152, 0.0722)), 0.01);
csColor *= mix(1.0, clamp(csRatio, 0.55, 1.6), csFade);
diffuseColor.rgb *= csColor;`,
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>
roughnessFactor = mix(roughnessFactor, 0.2, vCsExtra.x);`,
      );
  };
  material.customProgramCacheKey = () => 'contested-skies-terrain-v1';
  return material;
}
