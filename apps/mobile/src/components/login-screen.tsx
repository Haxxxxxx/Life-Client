import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/hooks/use-theme';

export function LoginScreen() {
  const { signInWithGoogle } = useAuth();
  const theme = useTheme();
  const [signingIn, setSigningIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSignIn() {
    setError(null);
    setSigningIn(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Sign-in failed');
    } finally {
      setSigningIn(false);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea}>
        <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Est. 2026
          </ThemedText>
          <ThemedText type="title" style={styles.title}>
            Life Client
          </ThemedText>
          <ThemedText themeColor="textSecondary" style={styles.subtitle}>
            Tasks, sports, dev activity, and your agenda — one dashboard.
          </ThemedText>

          <Pressable
            onPress={handleSignIn}
            disabled={signingIn}
            style={({ pressed }) => [
              styles.button,
              { backgroundColor: theme.primary, borderColor: theme.border, opacity: pressed || signingIn ? 0.7 : 1 },
            ]}>
            <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>
              {signingIn ? 'Signing in…' : 'Continue with Google'}
            </ThemedText>
          </Pressable>

          {error && (
            <ThemedText style={styles.error} themeColor="text">
              {error}
            </ThemedText>
          )}
        </ThemedView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.four,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderWidth: 1,
    borderRadius: Spacing.four,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.six,
    alignItems: 'center',
    gap: Spacing.two,
  },
  eyebrow: {
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  title: {
    fontSize: 32,
    lineHeight: 38,
  },
  subtitle: {
    textAlign: 'center',
    marginBottom: Spacing.three,
  },
  button: {
    marginTop: Spacing.four,
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.five,
    paddingVertical: Spacing.three,
  },
  error: {
    marginTop: Spacing.three,
    textAlign: 'center',
  },
});
