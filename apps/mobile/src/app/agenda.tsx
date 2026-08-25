import { type CalendarEvent, subscribeCalendarEvents } from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

function isAllDay(event: CalendarEvent): boolean {
  return !event.start.includes('T');
}

function dayKey(event: CalendarEvent): string {
  return isAllDay(event) ? event.start : event.start.slice(0, 10);
}

function dayLabel(key: string): string {
  const date = new Date(`${key}T00:00:00`);
  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowKey = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, '0')}-${String(tomorrow.getDate()).padStart(2, '0')}`;

  if (key === todayKey) return 'Today';
  if (key === tomorrowKey) return 'Tomorrow';
  return date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' });
}

function timeRangeLabel(event: CalendarEvent): string {
  if (isAllDay(event)) return 'All day';
  const start = new Date(event.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  const end = new Date(event.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${start} – ${end}`;
}

interface EventGroup {
  key: string;
  events: CalendarEvent[];
}

export default function AgendaScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeCalendarEvents(db, user.uid, setEvents, (err) => setError(err.message), 50);
  }, [user]);

  const groups: EventGroup[] = [];
  for (const event of events) {
    const key = dayKey(event);
    const group = groups.at(-1);
    if (group && group.key === key) group.events.push(event);
    else groups.push({ key, events: [event] });
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Agenda
          </ThemedText>
          <ThemedText type="subtitle">Calendar</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Upcoming events synced from Google Calendar, over the next 7 days.
          </ThemedText>
        </View>

        {error && (
          <ThemedText themeColor="text" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <FlatList
          data={groups}
          keyExtractor={(group) => group.key}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText themeColor="textSecondary">
                No events yet — connect Google Calendar from Integrations, or check back once it&apos;s
                synced.
              </ThemedText>
            </ThemedView>
          }
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <ThemedText type="code" themeColor="primary" style={styles.groupLabel}>
                {dayLabel(group.key)}
              </ThemedText>
              {group.events.map((event) => (
                <ThemedView key={event.id} type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
                  <View style={styles.cardInfo}>
                    <ThemedText type="smallBold" numberOfLines={1}>
                      {event.title}
                    </ThemedText>
                    <ThemedText type="code" themeColor="textSecondary">
                      {timeRangeLabel(event)}
                    </ThemedText>
                    {event.location && (
                      <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                        {event.location}
                      </ThemedText>
                    )}
                  </View>
                  {event.url && (
                    <Pressable
                      onPress={() => Linking.openURL(event.url!)}
                      style={[styles.openButton, { borderColor: theme.border }]}>
                      <ThemedText type="small" style={styles.openButtonText}>
                        Open
                      </ThemedText>
                    </Pressable>
                  )}
                </ThemedView>
              ))}
            </View>
          )}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1, paddingHorizontal: Spacing.four },
  header: { marginTop: Spacing.four, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  error: { marginTop: Spacing.two },
  listContent: { paddingVertical: Spacing.four, gap: Spacing.three },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  group: { gap: Spacing.two },
  groupLabel: { letterSpacing: 1, textTransform: 'uppercase' },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  cardInfo: { flex: 1, gap: 2, minWidth: 0 },
  openButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  openButtonText: { fontWeight: '700', textTransform: 'uppercase' },
});
