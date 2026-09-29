import { Color, DirectionalLight, Fog, HemisphereLight, MathUtils, type Scene, Vector3 } from 'three';
import { Sky } from 'three/addons/objects/Sky.js';

const HAZE_COLOR = 0xb3c7dc;

/** Physical sky dome, sun, ambient light and distance haze. */
export class SkySystem {
  readonly sunDirection = new Vector3();
  private readonly sky = new Sky();

  constructor(scene: Scene, elevationDeg = 38, azimuthDeg = 210) {
    this.sky.scale.setScalar(180000);
    const uniforms = this.sky.material.uniforms;
    uniforms['turbidity'].value = 6;
    uniforms['rayleigh'].value = 1.4;
    uniforms['mieCoefficient'].value = 0.004;
    uniforms['mieDirectionalG'].value = 0.8;
    this.sunDirection.setFromSphericalCoords(1, MathUtils.degToRad(90 - elevationDeg), MathUtils.degToRad(azimuthDeg));
    uniforms['sunPosition'].value.copy(this.sunDirection);
    scene.add(this.sky);

    const sun = new DirectionalLight(0xfff1e0, 3);
    sun.position.copy(this.sunDirection).multiplyScalar(1000);
    scene.add(sun);
    scene.add(new HemisphereLight(0xc4dbff, 0x5b5140, 1.3));
    scene.fog = new Fog(new Color(HAZE_COLOR), 6000, 75000);
  }

  /** Keeps the sky dome centered on the camera so it never clips. */
  update(cameraPosition: Vector3): void {
    this.sky.position.copy(cameraPosition);
  }
}
