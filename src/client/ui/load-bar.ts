import type { LoadProgress } from '../render/load-progress.ts';

/** A thin progress line along the bottom of the page while the scenery and jets load; it fades out when done. */
export function showLoadBar(root: HTMLElement, progress: LoadProgress): () => void {
  const bar = document.createElement('div');
  bar.className = 'load-bar';
  bar.setAttribute('role', 'progressbar');
  bar.setAttribute('aria-label', 'Loading scenery');
  const fill = document.createElement('span');
  bar.appendChild(fill);
  root.appendChild(bar);
  const unsubscribe = progress.subscribe((p) => {
    fill.style.transform = `scaleX(${p.fraction})`;
    bar.setAttribute('aria-valuenow', String(Math.round(p.fraction * 100)));
    bar.classList.toggle('done', p.complete && p.total > 0);
  });
  return () => {
    unsubscribe();
    bar.remove();
  };
}

/** "Loading scenery 3/8" for the match's loading panel. */
export function loadingText(progress: LoadProgress): string {
  return progress.complete ? 'Starting…' : `Loading scenery ${progress.done}/${progress.total}`;
}
