/**
 * Below are the colors that are used in the app. The colors are defined in the light and dark mode.
 * There are many other ways to style your app. For example, [Nativewind](https://www.nativewind.dev/), [Tamagui](https://tamagui.dev/), [unistyles](https://reactnativeunistyles.vercel.app), etc.
 */

import '@/global.css';

import { Platform } from 'react-native';

// Both keys resolve to the same "dark command-center" palette that
// apps/web and apps/knowledge moved to — this app no longer follows the
// OS light/dark setting, matching that decision. The two-key shape stays
// so useTheme()/useColorScheme() consumers don't need to change.
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
} as const;

export const Colors = {
  light: DARK_COMMAND_CENTER,
  dark: DARK_COMMAND_CENTER,
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
