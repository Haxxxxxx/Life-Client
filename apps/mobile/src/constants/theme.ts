/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Both keys resolve to the same "dark command-center" palette that
// apps/web and apps/knowledge moved to (kept in sync by hand with the
// --color-* tokens in their globals.css — there's no shared token module
// across the Tailwind/CSS and React Native StyleSheet worlds yet) — this
// app no longer follows the OS light/dark setting, matching that decision.
// The two-key shape stays so useTheme()/useColorScheme() consumers don't
// need to change.
const DARK_COMMAND_CENTER = {
  text: '#F4EFE6',
  background: '#141210',
  backgroundElement: '#1D1A16',
  backgroundSelected: '#FF7A3D26',
  textSecondary: '#A89E8F',
  primary: '#FF7A3D',
  primaryForeground: '#1A0F06',
  accent: '#FF7A3D26',
  border: '#F4EFE614',
  // Stronger border for surfaces that need to read as distinct from the
  // page background they sit on (mainly text inputs, which fill with
  // `background` itself) — the weak `border` alone is too close to
  // invisible there. Matches web/knowledge's --border-strong.
  borderStrong: '#F4EFE629',
} as const;

export const Colors = {
  // Separate object copies, not the same reference twice — `as const` only
  // enforces readonly-ness at the type level, so aliasing one object under
  // both keys would let a future mutation of one silently affect the other.
  light: { ...DARK_COMMAND_CENTER },
  dark: { ...DARK_COMMAND_CENTER },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const MaxContentWidth = 800;
