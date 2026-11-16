import {
  createCalendarEvent,
  deleteCalendarEvent,
  eventDayKey,
  eventDayLabel,
  isAllDay,
  isEventPast,
  timeRangeLabel,
  toDatetimeLocalValue,
  updateCalendarEvent,
  type CalendarEvent,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Linking, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { Button, ErrorBanner, PressableScale } from '@/components/ui';
import { ThemedView } from '@/components/themed-view';
import { Common } from '@/constants/styles';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { webApiClient } from '@/lib/webApiClient';




interface EventGroup {
  key: string;
  events: CalendarEvent[];
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
  // An all-day event has no time to edit, and its dates must survive a title
  // change. The previous code fell through to the "next hour" defaults for
  // these, so editing a Dec 25 all-day event to fix a typo moved it to a
  // one-hour slot TODAY — a silent data loss on an edit the user thought was
  // cosmetic.
  const editingAllDay = Boolean(initial && isAllDay(initial));

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
  const canSubmit =
    title.trim().length > 0 && (editingAllDay || (startDate !== null && endDate !== null && endDate > startDate));

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <TextInput
        value={title}
        onChangeText={setTitle}
        placeholder="Event title"
        placeholderTextColor={theme.textSecondary}
        style={[Common.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <TextInput
        value={location}
        onChangeText={setLocation}
        placeholder="Location (optional)"
        placeholderTextColor={theme.textSecondary}
        style={[Common.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <TextInput
        value={start}
        onChangeText={setStart}
        placeholder="Start YYYY-MM-DDTHH:MM"
        placeholderTextColor={theme.textSecondary}
        style={[Common.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <TextInput
        value={end}
        onChangeText={setEnd}
        placeholder="End YYYY-MM-DDTHH:MM"
        placeholderTextColor={theme.textSecondary}
        style={[Common.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <View style={styles.formActions}>
        <Button
          label={submitLabel}
          onPress={() =>
            canSubmit &&
            onSubmit({
              title: title.trim(),
              // For an all-day event, send its stored YYYY-MM-DD values back
              // untouched: the server maps a date-only string to Google's
              // `date` field, so the event stays all-day on the day it is on.
              start: editingAllDay ? initial!.start : startDate!.toISOString(),
              end: editingAllDay ? initial!.end : endDate!.toISOString(),
              location: location.trim() || undefined,
            })}
          disabled={!canSubmit}
        />
        <PressableScale onPress={onCancel}>
          <ThemedText type="small" themeColor="textSecondary">
            Cancel
          </ThemedText>
        </PressableScale>
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
    if (!user) return;
    return data.subscribeCalendarEvents(user.uid, setEvents, (err) => setError(err.message), 50);
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
  // Past events are filtered rather than deleted: removing an already-elapsed
  // event through Google's API is unreliable (it can fail in ways that surface
  // as a 500), and there's no real need to manage them here.
  for (const event of events.filter((e) => !isEventPast(e))) {
    const key = eventDayKey(event);
    const group = groups.at(-1);
    if (group && group.key === key) group.events.push(event);
    else groups.push({ key, events: [event] });
  }

  return (
    <ThemedView style={Common.screen}>
      <SafeAreaView style={Common.safeArea} edges={['top']}>
        <View style={styles.headerRow}>
          <View style={Common.headerText}>
            <ThemedText type="code" themeColor="primary" style={Common.eyebrow}>
              Agenda
            </ThemedText>
            <ThemedText type="subtitle">Calendar</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Upcoming events synced from Google Calendar, over the next 7 days.
            </ThemedText>
          </View>
          {!formOpen && (
            <Button
              label="New event"
              onPress={() => setFormOpen(true)}
            />
          )}
        </View>

        <ErrorBanner>{error}</ErrorBanner>

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
              <ThemedView type="backgroundElement" style={[Common.emptyState, { borderColor: theme.border }]}>
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
                {eventDayLabel(group.key)}
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
                    <PressableScale style={styles.cardInfo} onPress={() => setEditingId(event.id)}>
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
                    </PressableScale>
                    <View style={styles.cardActions}>
                      {event.url && (
                        <PressableScale
                          onPress={() => Linking.openURL(event.url!)}
                          style={[styles.openButton, { borderColor: theme.border }]}>
                          <ThemedText type="small" style={styles.openButtonText}>
                            Open
                          </ThemedText>
                        </PressableScale>
                      )}
                      <PressableScale onPress={() => handleDelete(event.id)}>
                        <ThemedText type="small" themeColor="danger">
                          Delete
                        </ThemedText>
                      </PressableScale>
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two, marginTop: Spacing.four },
  listContent: { paddingVertical: Spacing.four, gap: Spacing.three },
  group: { gap: Spacing.two },
  groupLabel: { letterSpacing: 1, textTransform: 'uppercase' },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  cardInfo: { flex: 1, gap: 2, minWidth: 0 },
  cardActions: { gap: Spacing.one, alignItems: 'flex-end' },
  openButton: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  openButtonText: { fontWeight: '700', textTransform: 'uppercase' },
  form: { gap: Spacing.two, borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, marginBottom: Spacing.three },
  formActions: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
});
