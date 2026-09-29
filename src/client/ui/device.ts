export type MatchMedia = (query: string) => { matches: boolean };

/** True on phones and tablets with no mouse or trackpad attached (the prototype needs keyboard and mouse). */
export function isTouchOnly(matchMedia: MatchMedia): boolean {
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}
