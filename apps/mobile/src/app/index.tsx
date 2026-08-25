import {
  type CalendarEvent,
  type DevActivitySummary,
  type Reminder,
  type SportActivity,
  type Task,
  isDueSoon,
  subscribeCalendarEvents,
  subscribeDevActivity,
  subscribeReminders,
  subscribeSportActivities,
  subscribeTasks,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { MaxContentWidth, Spacing } from '@/constants/theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <ThemedView type="backgroundElement" style={styles.card}>
      <ThemedText type="code" themeColor="primary" style={styles.cardEyebrow}>
        {title}
      </ThemedText>
      {children}
    </ThemedView>
  );
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [github, setGithub] = useState<DevActivitySummary | null>(null);
  const [gitlab, setGitlab] = useState<DevActivitySummary | null>(null);
  const [reminders, setReminders] = useState<Reminder[]>([]);

  useEffect(() => {
    if (!user || !db) return;
    const unsubs = [
      subscribeTasks(db, user.uid, setTasks),
      subscribeSportActivities(db, user.uid, setActivities, undefined, 1),
      subscribeCalendarEvents(db, user.uid, setEvents, undefined, 3),
      subscribeDevActivity(db, user.uid, 'github', setGithub),
      subscribeDevActivity(db, user.uid, 'gitlab', setGitlab),
      subscribeReminders(db, user.uid, setReminders),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const openTasks = tasks.filter((t) => t.status !== 'done');
  const latestActivity = activities[0];
  const openPrCount = (github?.openPullRequests.length ?? 0) + (gitlab?.openPullRequests.length ?? 0);
  const dueSoonReminders = reminders.filter((r) => isDueSoon(r.deadline));

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              Overview
            </ThemedText>
            <ThemedText type="subtitle">
              Welcome back{user?.displayName ? `, ${user.displayName.split(' ')[0]}` : ''}
            </ThemedText>
          </View>

          <View style={styles.grid}>
            <Card title="Tasks">
              <ThemedText type="title" style={styles.bigNumber}>
                {openTasks.length}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                open task{openTasks.length === 1 ? '' : 's'}
              </ThemedText>
            </Card>

            <Card title="Sports">
              {latestActivity ? (
                <>
                  <ThemedText type="smallBold">{latestActivity.name}</ThemedText>
                  <ThemedText themeColor="textSecondary">
                    {latestActivity.type} · {new Date(latestActivity.startDate).toLocaleDateString()}
                  </ThemedText>
                </>
              ) : (
                <ThemedText themeColor="textSecondary">No activity yet — connect Strava.</ThemedText>
              )}
            </Card>

            <Card title="Dev Activity">
              <ThemedText type="title" style={styles.bigNumber}>
                {openPrCount}
              </ThemedText>
              <ThemedText themeColor="textSecondary">
                open pull request{openPrCount === 1 ? '' : 's'}
              </ThemedText>
            </Card>

            <Card title="Agenda">
              {events.length > 0 ? (
                <ThemedText themeColor="textSecondary">
                  Next: <ThemedText type="smallBold">{events[0]!.title}</ThemedText>
                </ThemedText>
              ) : (
                <ThemedText themeColor="textSecondary">No events yet — connect Calendar.</ThemedText>
              )}
            </Card>

            <Card title="Remember">
              {dueSoonReminders.length > 0 ? (
                <>
                  <ThemedText type="title" themeColor="primary" style={styles.bigNumber}>
                    {dueSoonReminders.length}
                  </ThemedText>
                  <ThemedText themeColor="textSecondary">
                    due soon — next: <ThemedText type="smallBold">{dueSoonReminders[0]!.title}</ThemedText>
                  </ThemedText>
                </>
              ) : (
                <ThemedText themeColor="textSecondary">Nothing due soon.</ThemedText>
              )}
            </Card>
          </View>
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  safeArea: { flex: 1 },
  content: {
    alignItems: 'center',
    paddingHorizontal: Spacing.four,
    gap: Spacing.four,
  },
  header: {
    width: '100%',
    maxWidth: MaxContentWidth,
    marginTop: Spacing.four,
    gap: Spacing.one,
  },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  grid: {
    width: '100%',
    maxWidth: MaxContentWidth,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.three,
  },
  card: {
    flexGrow: 1,
    flexBasis: 160,
    borderRadius: Spacing.three,
    padding: Spacing.four,
    gap: Spacing.one,
  },
  cardEyebrow: { letterSpacing: 1.5, textTransform: 'uppercase', marginBottom: Spacing.one },
  bigNumber: { fontSize: 32, lineHeight: 36 },
});
