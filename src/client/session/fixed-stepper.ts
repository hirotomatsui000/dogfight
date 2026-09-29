const EPSILON = 1e-9;

/** Accumulates variable frame times into fixed simulation steps (the "fix your timestep" pattern). */
export class FixedStepper {
  readonly dt: number;
  readonly maxStepsPerFrame: number;
  private accumulator = 0;

  constructor(dt: number, maxStepsPerFrame = 5) {
    this.dt = dt;
    this.maxStepsPerFrame = maxStepsPerFrame;
  }

  advance(frameDt: number, step: () => void): number {
    this.accumulator += Math.max(0, frameDt);
    let steps = 0;
    while (this.accumulator + EPSILON >= this.dt && steps < this.maxStepsPerFrame) {
      step();
      this.accumulator = Math.max(0, this.accumulator - this.dt);
      steps++;
    }
    // After a long stall (tab in background) drop the backlog instead of fast-forwarding.
    if (this.accumulator >= this.dt) this.accumulator %= this.dt;
    return steps;
  }

  /** Fraction (0..1) of a step that has elapsed since the last simulated step. */
  get alpha(): number {
    return Math.min(this.accumulator / this.dt, 1);
  }
}
