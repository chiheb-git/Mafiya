/**
 * Semantic design tokens for the mobile app.
 *
 * These tokens mirror the naming conventions used in web artifacts (index.css)
 * so that multi-artifact projects share a cohesive visual identity.
 *
 * Replace the placeholder values below with values that match the project's
 * brand. If a sibling web artifact exists, read its index.css and convert the
 * HSL values to hex so both artifacts use the same palette.
 *
 * To add dark mode, add a `dark` key with the same token names.
 * The useColors() hook will automatically pick it up.
 */

const palette = {
    text: '#F4EBDD',
    tint: '#E15B45',
    background: '#111417',
    foreground: '#F4EBDD',
    card: '#1B2021',
    cardForeground: '#F4EBDD',
    primary: '#E15B45',
    primaryForeground: '#17110F',
    secondary: '#252B2B',
    secondaryForeground: '#F4EBDD',
    muted: '#202627',
    mutedForeground: '#9A9A91',
    accent: '#D6A84F',
    accentForeground: '#17110F',
    destructive: '#D56C69',
    destructiveForeground: '#FFF3EA',
    border: '#35403D',
    input: '#2B3231',
  };

const colors = {
  light: {
    ...palette,
  },
  dark: { ...palette },

  // Border radius (in px). Sync from the sibling web artifact's --radius
  // CSS variable. This value applies to cards, buttons, inputs, and modals.
  radius: 18,
};

export default colors;
