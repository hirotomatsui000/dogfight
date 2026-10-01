/** Counts loading work (scenery photos, jet models) for the progress bar (spec §24, M1c). */
export class LoadProgress {
  total = 0;
  done = 0;
  private readonly listeners = new Set<(p: LoadProgress) => void>();

  /** Counts `work` in the total now and as done when it settles (loaded or failed). */
  track<T>(work: Promise<T>): Promise<T> {
    this.total++;
    this.notify();
    return work.finally(() => {
      this.done++;
      this.notify();
    });
  }

  get complete(): boolean {
    return this.done >= this.total;
  }

  /** 0..1; 1 when nothing is loading. */
  get fraction(): number {
    return this.total === 0 ? 1 : this.done / this.total;
  }

  /** Calls `fn` now and on every change; returns the unsubscribe function. */
  subscribe(fn: (p: LoadProgress) => void): () => void {
    this.listeners.add(fn);
    fn(this);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn(this);
  }
}
