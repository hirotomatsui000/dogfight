import type { HudColor } from '../ui/settings.ts';

/** HUD colors and fonts shared by all HUD layers. */
export const GREEN = '#63ff95';
export const AMBER = '#ffc14d';
export const RED = '#ff5a4f';
export const WHITE = '#e8fff0';
export const FRIEND = '#6fc3ff';
export const FOE = '#ff6b5e';
export const SHADOW = 'rgba(0, 0, 0, 0.65)';
export const PANEL = 'rgba(6, 14, 10, 0.72)';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';
export const FONT = `600 15px ${MONO}`;
export const FONT_BIG = `700 22px ${MONO}`;
export const FONT_SMALL = `500 12px ${MONO}`;

/** The HUD's own color choices (spec §15.2: clean green, with amber and white options). */
export const HUD_COLOR_VALUES: Readonly<Record<HudColor, string>> = { green: GREEN, amber: AMBER, white: WHITE };

/** Main HUD symbology color. Team colors and red warnings stay fixed whatever the choice. */
export let PRIMARY = GREEN;

export function setHudColor(color: HudColor): void {
  PRIMARY = HUD_COLOR_VALUES[color];
}
