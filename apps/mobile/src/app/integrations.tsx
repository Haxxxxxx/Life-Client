import {
  disconnectIntegration,
  startOAuthConnect,
  type IntegrationConnection,
  type IntegrationProvider,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { WEB_APP_URL } from '@/lib/firebase';
import { webApiClient } from '@/lib/webApiClient';

const PROVIDER_META: Record<IntegrationProvider, { label: string; description: string; badge: string }> = {
  github: { label: 'GitHub', description: 'Open PRs/issues assigned to you, in Tasks.', badge: 'GH' },
  gitlab: { label: 'GitLab', description: 'Same as GitHub, for GitLab-hosted projects.', badge: 'GL' },
  google_calendar: { label: 'Google Calendar', description: "This week's events on your Dashboard.", badge: 'CAL' },
  strava: { label: 'Strava', description: 'Your runs/rides synced into Sports.', badge: 'STR' },
  spotify: { label: 'Spotify', description: 'Currently playing, recent tracks, and top artists in Music.', badge: 'SPT' },
};

const PROVIDER_ORDER: IntegrationProvider[] = ['github', 'gitlab', 'google_calendar', 'strava', 'spotify'];

export default function IntegrationsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [connections, setConnections] = useState<Record<IntegrationProvider, IntegrationConnection> | null>(null);
  const [pending, setPending] = useState<IntegrationProvider | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeIntegrations(user.uid, setConnections);
  }, [user]);

  const missingWebAppUrl = !WEB_APP_URL;

  // Both actions are authenticated POSTs to the web app now — the uid is taken
  // from the ID token server-side rather than from a query param, so these can
  // no longer be plain browser links. Connect still needs the system browser
  // (that's where the user authorizes), but we fetch the provider URL first so
  // the request can carry the bearer token. Disconnect never leaves the app.
  async function handleToggle(provider: IntegrationProvider, connected: boolean) {
    if (missingWebAppUrl || !user || pending) return;
    setPending(provider);
    setError(null);
    try {
      if (connected) {
        await disconnectIntegration(webApiClient, provider);
      } else {
        const url = await startOAuthConnect(webApiClient, provider, '/integrations');
        await WebBrowser.openBrowserAsync(url);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setPending(null);
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Connect
            </ThemedText>
            <ThemedText type="subtitle">Integrations</ThemedText>
            <ThemedText themeColor="textSecondary">
              Connecting opens your browser to authorize — come back to this tab once it&apos;s done.
            </ThemedText>
          </View>

          {missingWebAppUrl && (
            <ThemedView type="backgroundElement" style={[styles.notice, { borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="textSecondary">
                EXPO_PUBLIC_WEB_APP_URL isn&apos;t set — connect actions are disabled until
                the web app is deployed.
              </ThemedText>
            </ThemedView>
          )}

          {error && (
            <ThemedView type="backgroundElement" style={[styles.notice, { borderColor: theme.border }]}>
              <ThemedText type="small" themeColor="text">
                {error}
              </ThemedText>
            </ThemedView>
          )}

          <View style={styles.list}>
            {PROVIDER_ORDER.map((provider) => {
              const meta = PROVIDER_META[provider];
              const connection = connections?.[provider];
              const connected = connection?.status === 'connected';
              return (
                <ThemedView key={provider} type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
                  <View style={styles.cardHeader}>
                    <View style={[styles.badge, { borderColor: theme.border, backgroundColor: theme.accent }]}>
                      <ThemedText type="code" style={styles.badgeText}>
                        {meta.badge}
                      </ThemedText>
                    </View>
                    <View style={styles.cardText}>
                      <ThemedText type="smallBold">{meta.label}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {meta.description}
                      </ThemedText>
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <ThemedText
                      type="small"
                      numberOfLines={1}
                      themeColor={connected ? 'primary' : 'textSecondary'}
                      style={styles.connectionStatus}>
                      {connected
                        ? `Connected${connection?.externalAccountLabel ? ` · ${connection.externalAccountLabel}` : ''}`
                        : 'Not connected'}
                    </ThemedText>
                    <Pressable
                      onPress={() => handleToggle(provider, connected)}
                      disabled={missingWebAppUrl || pending !== null}
                      accessibilityRole="button"
                      accessibilityState={{ disabled: missingWebAppUrl || pending !== null }}
                      accessibilityLabel={`${connected ? 'Disconnect' : 'Connect'} ${meta.label}`}
                      style={[
                        styles.actionButton,
                        {
                          borderColor: theme.border,
                          backgroundColor: connected ? 'transparent' : theme.primary,
                          opacity: missingWebAppUrl || pending !== null ? 0.4 : 1,
                        },
                      ]}>
                      <ThemedText
                        type="small"
                        style={connected ? undefined : { color: theme.primaryForeground, fontWeight: '700' }}>
                        {pending === provider ? '…' : connected ? 'Disconnect' : 'Connect'}
                      </ThemedText>
                    </Pressable>
                  </View>
                </ThemedView>
              );
            })}
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  content: { gap: Spacing.four },
  header: { marginTop: Spacing.four, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  notice: { borderWidth: 1, borderStyle: 'dashed', borderRadius: Spacing.three, padding: Spacing.three },
  list: { gap: Spacing.three },
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  cardHeader: { flexDirection: 'row', gap: Spacing.two, alignItems: 'flex-start' },
  badge: { borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2 },
  badgeText: { fontSize: 10 },
  cardText: { flex: 1, gap: 2 },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  connectionStatus: { flex: 1 },
  actionButton: {
    flexShrink: 0,
    borderWidth: 1,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
});
