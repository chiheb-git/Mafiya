import { useColorScheme } from 'react-native';
import colors from '@/constants/colors';

/**
 * Returns the design tokens for the current color scheme.
 *
 * Untouched logic — only `constants/colors.ts` changed (new Dark Cinematic
 * tokens). The app is permanently dark-themed, so this still resolves to
 * the same `light` palette regardless of device scheme unless a `dark` key
 * is added later.
 */
export function useColors() {
  const scheme = useColorScheme();
  const palette =
    scheme === 'dark' && 'dark' in colors
      ? (colors as unknown as { dark: typeof colors.light }).dark
      : colors.light;
  return { ...palette, radius: colors.radius };
}
