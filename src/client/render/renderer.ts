import { NeutralToneMapping, PerspectiveCamera, Scene, SRGBColorSpace, WebGLRenderer } from 'three';

const NEAR_M = 0.5;
const FAR_M = 200000;

export class Renderer {
  readonly webgl: WebGLRenderer;
  readonly scene = new Scene();
  readonly camera = new PerspectiveCamera(70, 1, NEAR_M, FAR_M);
  private readonly onResize = () => this.resize();

  constructor(container: HTMLElement) {
    this.webgl = new WebGLRenderer({ antialias: true, logarithmicDepthBuffer: true, powerPreference: 'high-performance' });
    this.webgl.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.webgl.outputColorSpace = SRGBColorSpace;
    this.webgl.toneMapping = NeutralToneMapping;
    this.webgl.toneMappingExposure = 1;
    container.appendChild(this.webgl.domElement);
    this.resize();
    window.addEventListener('resize', this.onResize);
  }

  resize(): void {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.webgl.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(): void {
    this.webgl.render(this.scene, this.camera);
  }

  dispose(): void {
    window.removeEventListener('resize', this.onResize);
    this.webgl.dispose();
    // Free the GPU context now: the title screen and each match create their own renderer.
    this.webgl.forceContextLoss();
    this.webgl.domElement.remove();
  }

  static isWebGLAvailable(): boolean {
    try {
      const canvas = document.createElement('canvas');
      return Boolean(canvas.getContext('webgl2') ?? canvas.getContext('webgl'));
    } catch {
      return false;
    }
  }
}
