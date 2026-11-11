import { type ReactNode, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Pressable,
  type PressableProps,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Shared mobile primitives.
 *
 * The web app has had a ui.tsx with ~17 primitives since the design-system
 * work; mobile had none, so every screen re-declared its own `eyebrow`,
 * `chip`, `badge`, `input`, `card`, `emptyState` and `deleteText`. They
 * drifted: card padding is 24 on two screens and 16 on the rest, inputs use
 * two different radius/padding pairs, progress bars come in 6, 8 and 10pt,
 * and badges are pills in four places and squares in two.
 *
 * Nothing here changes the visual direction — it is the existing look, stated
 * once so screens can stop disagreeing.
 */

/** Minimum comfortable touch target. Most controls here were ~24pt. */
export const HIT_TARGET = 44;

// ---------------------------------------------------------------------------
// Press feedback
// ---------------------------------------------------------------------------

/**
 * Pressable with feedback on both platforms.
 *
 * A grep for `android_ripple` across apps/mobile/src returned zero hits, and
 * almost no Pressable had a pressed style — tapping anything gave no
 * acknowledgement at all, which is most of why the app felt unfinished next
 * to its web counterpart.
 */
export function PressableScale({
  style,
  children,
  rippleColor,
  ...rest
}: PressableProps & { rippleColor?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <Pressable
      android_ripple={{ color: rippleColor ?? theme.backgroundSelected, borderless: false }}
      style={(state) => [
        { opacity: state.pressed ? 0.72 : 1, transform: [{ scale: state.pressed ? 0.985 : 1 }] },
        typeof style === 'function' ? style(state) : style,
      ]}
      {...rest}>
      {children}
    </Pressable>
  );
}

// ---------------------------------------------------------------------------
// Buttons
// ---------------------------------------------------------------------------

type ButtonVariant = 'primary' | 'outline' | 'danger';

/**
 * `busy` is the part that was missing everywhere: add/save actions showed no
 * in-flight feedback, so a slow write looked like a dead button and invited a
 * second tap.
 */
export function Button({
  label,
  onPress,
  variant = 'primary',
  busy = false,
  disabled = false,
  style,
}: {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  busy?: boolean;
  disabled?: boolean;
  style?: ViewStyle;
}) {
  const theme = useTheme();
  const inactive = disabled || busy;

  const background =
    variant === 'primary' ? theme.primary : variant === 'danger' ? 'transparent' : 'transparent';
  const borderColor = variant === 'danger' ? theme.danger : theme.border;
  const labelColor =
    variant === 'primary' ? theme.primaryForeground : variant === 'danger' ? theme.danger : theme.text;

  return (
    <PressableScale
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityState={{ disabled: inactive, busy }}
      accessibilityLabel={label}
      style={[
        styles.button,
        { backgroundColor: background, borderColor, opacity: inactive ? 0.5 : 1 },
        style,
      ]}>
      {busy ? (
        <ActivityIndicator size="small" color={labelColor} />
      ) : (
        <ThemedText type="smallBold" style={{ color: labelColor }}>
          {label}
        </ThemedText>
      )}
    </PressableScale>
  );
}

/** Toggle pill. Roughly ten screens hand-rolled this, at ~26pt tall. */
export function Chip({
  label,
  active = false,
  onPress,
}: {
  label: string;
  active?: boolean;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <PressableScale
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        {
          borderColor: active ? theme.primary : theme.border,
          backgroundColor: active ? theme.backgroundSelected : 'transparent',
        },
      ]}>
      <ThemedText type="small" style={{ color: active ? theme.primary : theme.textSecondary }}>
        {label}
      </ThemedText>
    </PressableScale>
  );
}

// ---------------------------------------------------------------------------
// States
// ---------------------------------------------------------------------------

/**
 * Pulsing placeholder for data that has not arrived.
 *
 * Only 1 of 11 mobile screens tracked a loading state, so the rest rendered
 * their *empty* state first — "No tasks yet" — then popped to content when
 * the first Firestore snapshot landed. Being told you have nothing and then
 * corrected, on every screen, every time, is the loudest "unfinished" signal
 * in the app.
 *
 * Animated rather than reanimated: this is a single opacity loop on the JS
 * driver's native path, and it avoids pulling a worklet into every screen.
 */
export function Skeleton({ height = 56, style }: { height?: number; style?: ViewStyle }) {
  const theme = useTheme();
  // useState initialiser, not useRef().current: this project builds with
  // reactCompiler, whose lint rule rejects reading a ref during render. The
  // initialiser runs once, so the Animated.Value is just as stable.
  const [pulse] = useState(() => new Animated.Value(0.4));

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.4, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  return (
    <Animated.View
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={[{ height, opacity: pulse, backgroundColor: theme.backgroundElement, borderRadius: Spacing.three }, style]}
    />
  );
}

/** A few skeleton rows standing in for a list. */
export function SkeletonList({ rows = 3 }: { rows?: number }) {
  return (
    <View style={{ gap: Spacing.two }} accessibilityLabel="Loading">
      {Array.from({ length: rows }, (_, i) => (
        <Skeleton key={i} />
      ))}
    </View>
  );
}

/**
 * Empty state with somewhere to go. Every screen had a one-line grey sentence
 * in a box; none of them offered the action that would resolve the emptiness.
 */
export function EmptyState({ title, hint, action }: { title: string; hint?: string; action?: ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.empty, { borderColor: theme.border }]}>
      <ThemedText type="smallBold">{title}</ThemedText>
      {hint ? (
        <ThemedText type="small" themeColor="textSecondary" style={styles.emptyHint}>
          {hint}
        </ThemedText>
      ) : null}
      {action}
    </ThemedView>
  );
}

/** Errors were rendered as ordinary body text, so they did not read as errors. */
export function ErrorBanner({ children }: { children?: string | null }) {
  const theme = useTheme();
  if (!children) return null;
  return (
    <View
      accessibilityRole="alert"
      style={[styles.error, { borderColor: theme.danger, backgroundColor: `${theme.danger}1A` }]}>
      <ThemedText type="small" style={{ color: theme.danger }}>
        {children}
      </ThemedText>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: HIT_TARGET,
    paddingHorizontal: Spacing.four,
  },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    justifyContent: 'center',
    minHeight: 32,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  empty: {
    alignItems: 'center',
    borderRadius: Spacing.three,
    borderStyle: 'dashed',
    borderWidth: 1,
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.five,
  },
  emptyHint: { textAlign: 'center' },
  error: {
    borderRadius: Spacing.two,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
});
