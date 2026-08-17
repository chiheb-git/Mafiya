/**
 * MAFIA — Dark Cinematic palette
 *
 * Direction: True Detective S1 / The Batman (2022) nighttime lighting.
 * Deep near-black backgrounds, a single desaturated blood-red accent,
 * charcoal surfaces, off-white (never pure white) text.
 *
 * Kept as a single `light` key (the app is permanently dark-themed) so the
 * existing useColors()/scheme-switch contract in the rest of the codebase
 * keeps working untouched.
 */

const light = {
  // Base
  background: '#0A0A0A',
  backgroundElevated: '#111417',
  foreground: '#F2EDE2',
  mutedForeground: '#9A9086',

  // Blood-red accent system (never a vivid/pure red)
  primary: '#6E1414',
  primaryForeground: '#F2EDE2',
  accent: '#8A1A1A',
  accentSoft: '#3D0A0A',
  accentForeground: '#F2EDE2',

  // Surfaces
  card: '#131110',
  cardGlass: 'rgba(19,17,16,0.72)',
  secondary: '#1C1917',
  secondaryGlass: 'rgba(28,25,23,0.6)',
  muted: '#201C1A',
  border: 'rgba(242,237,226,0.09)',
  borderStrong: 'rgba(242,237,226,0.16)',

  // Feedback
  destructive: '#B23A3A',
  destructiveForeground: '#F2EDE2',
  success: '#5C7A5E',

  // Glow / atmosphere
  glow: '#8A1A1A',
  glowSoft: 'rgba(138,26,26,0.35)',
  sheen: 'rgba(242,237,226,0.06)',
} as const;

const colors = {
  light,
  radius: 18,
};

export default colors;
export type ColorPalette = typeof light;
