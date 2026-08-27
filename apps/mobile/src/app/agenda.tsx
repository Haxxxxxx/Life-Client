import {
  createCalendarEvent,
  deleteCalendarEvent,
  subscribeCalendarEvents,
  updateCalendarEvent,
  type CalendarEvent,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Linking, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';
import { webApiClient } from '@/lib/webApiClient';

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

function toDatetimeLocalValue(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function parseDatetimeLocalValue(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi] = match.map(Number) as unknown as number[];
  return new Date(y!, mo! - 1, d!, h, mi);
}

function EventForm({
  initial,
  onSubmit,
  onCancel,
  submitLabel,
}: {
  initial?: CalendarEvent;
  onSubmit: (input: { title: string; start: string; end: string; location?: string }) => void;
  onCancel: () => void;
  submitLabel: string;
}) {
  const theme = useTheme();
  const [title, setTitle] = useState(initial?.title ?? '');
  const [location, setLocation] = useState(initial?.location ?? '');
  const [start, setStart] = useState(() => {
    if (initial && !isAllDay(initial)) return toDatetimeLocalValue(new Date(initial.start));
    const in1h = new Date();
    in1h.setMinutes(0, 0, 0);
    in1h.setHours(in1h.getHours() + 1);
    return toDatetimeLocalValue(in1h);
  });
  const [end, setEnd] = useState(() => {
    if (initial && !isAllDay(initial)) return toDatetimeLocalValue(new Date(initial.end));
    const in2h = new Date();
    in2h.setMinutes(0, 0, 0);
    in2h.setHours(in2h.getHours() + 2);
    return toDatetimeLocalValue(in2h);
  });

  const startDate = parseDatetimeLocalValue(start);
  const endDate = parseDatetimeLocalValue(end);
  const canSubmit = title.trim().length > 0 && startDate !== null && endDate !== null;

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Event title"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <TextInput
        value={location}
        onChangeText={setLocation}
        placeholder="Location (optional)"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <TextInput
        value={start}
        onChangeText={setStart}
        placeholder="Start YYYY-MM-DDTHH:MM"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <TextInput
        value={end}
        onChangeText={setEnd}
        placeholder="End YYYY-MM-DDTHH:MM"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
      />
      <View style={styles.formActions}>
        <Pressable
          disabled={!canSubmit}
          onPress={() =>
            canSubmit &&
            onSubmit({
              title: title.trim(),
              start: startDate!.toISOString(),
              end: endDate!.toISOString(),
              location: location.trim() || undefined,
            })
          }
          style={[styles.addButton, { backgroundColor: theme.primary, borderColor: theme.border, opacity: canSubmit ? 1 : 0.5 }]}>
          <ThemedText style={{ color: theme.primaryForeground, fontWeight: '700' }}>{submitLabel}</ThemedText>
        </Pressable>
        <Pressable onPress={onCancel}>
          <ThemedText type="small" themeColor="textSecondary">
            Cancel
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

export default function AgendaScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeCalendarEvents(db, user.uid, setEvents, (err) => setError(err.message), 50);
  }, [user]);

  async function handleCreate(input: { title: string; start: string; end: string; location?: string }) {
    setError(null);
    try {
      await createCalendarEvent(webApiClient, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create event');
    }
  }

  async function handleUpdate(eventId: string, input: { title: string; start: string; end: string; location?: string }) {
    setError(null);
    try {
      await updateCalendarEvent(webApiClient, eventId, input);
      setEditingId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update event');
    }
  }

  async function handleDelete(eventId: string) {
    setError(null);
    try {
      await deleteCalendarEvent(webApiClient, eventId);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not delete event');
    }
  }

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
        <View style={styles.headerRow}>
          <View style={styles.headerText}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Agenda
            </ThemedText>
            <ThemedText type="subtitle">Calendar</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Upcoming events synced from Google Calendar, over the next 7 days.
            </ThemedText>
          </View>
          {!formOpen && (
            <Pressable
              onPress={() => setFormOpen(true)}
              style={[styles.logToggle, { backgroundColor: theme.primary, borderColor: theme.border }]}>
              <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
                New event
              </ThemedText>
            </Pressable>
          )}
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
          ListHeaderComponent={
            formOpen ? (
              <EventForm onSubmit={handleCreate} onCancel={() => setFormOpen(false)} submitLabel="Create" />
            ) : null
          }
          ListEmptyComponent={
            !formOpen ? (
              <ThemedView type="backgroundElement" style={styles.emptyState}>
                <ThemedText themeColor="textSecondary">
                  No events yet — connect Google Calendar from Integrations, add one above, or check back
                  once it&apos;s synced.
                </ThemedText>
              </ThemedView>
            ) : null
          }
          renderItem={({ item: group }) => (
            <View style={styles.group}>
              <ThemedText type="code" themeColor="primary" style={styles.groupLabel}>
                {dayLabel(group.key)}
              </ThemedText>
              {group.events.map((event) =>
                editingId === event.id ? (
                  <ThemedView key={event.id} type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
                    <EventForm
                      initial={event}
                      onSubmit={(input) => handleUpdate(event.id, input)}
                      onCancel={() => setEditingId(null)}
                      submitLabel="Save"
                    />
                  </ThemedView>
                ) : (
                  <ThemedView key={event.id} type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
                    <Pressable style={styles.cardInfo} onPress={() => setEditingId(event.id)}>
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
                    </Pressable>
                    <View style={styles.cardActions}>
                      {event.url && (
                        <Pressable
                          onPress={() => Linking.openURL(event.url!)}
                          style={[styles.openButton, { borderColor: theme.border }]}>
                          <ThemedText type="small" style={styles.openButtonText}>
                            Open
                          </ThemedText>
                        </Pressable>
                      )}
                      <Pressable onPress={() => handleDelete(event.id)}>
                        <ThemedText type="small" style={styles.deleteText}>
                          Delete
                        </ThemedText>
                      </Pressable>
                    </View>
                  </ThemedView>
                ),
              )}
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two, marginTop: Spacing.four },
  headerText: { flex: 1, gap: Spacing.one },
  logToggle: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
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
  cardActions: { gap: Spacing.one, alignItems: 'flex-end' },
  openButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  openButtonText: { fontWeight: '700', textTransform: 'uppercase' },
  deleteText: { color: '#dc2626' },
  form: { gap: Spacing.two, borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, marginBottom: Spacing.three },
  input: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  addButton: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.two, alignItems: 'center' },
});
