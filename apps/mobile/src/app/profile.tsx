import {
  CHARACTERISTICS,
  type CharacteristicDefinition,
  type DevActivitySummary,
  MANUAL_EVENT_TYPES,
  type ManualEventType,
  type ManualProgress,
  type SportActivity,
  type Task,
  type TaskCategory,
  computeCategoryXp,
  computeCraftXp,
  computeDisciplineXp,
  computeFitnessXp,
  levelFromXp,
  logManualEvent,
  subscribeDevActivity,
  subscribeManualProgress,
  subscribeSportActivities,
  subscribeTasks,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

const EVENT_TYPE_LABEL = Object.fromEntries(MANUAL_EVENT_TYPES.map((t) => [t.id, t.label])) as Record<
  ManualEventType,
  string
>;

function ProgressBar({ progress }: { progress: number }) {
  const theme = useTheme();
  const pct = Math.min(100, Math.max(0, progress * 100));
  return (
    <View style={[styles.progressTrack, { borderColor: theme.border }]}>
      <View style={[styles.progressFill, { width: `${pct}%`, backgroundColor: theme.primary }]} />
    </View>
  );
}

interface EventInput {
  eventType: ManualEventType;
  durationMinutes: number;
  peopleCount: number;
}

function LogEventForm({ onSubmit }: { onSubmit: (input: EventInput) => void }) {
  const theme = useTheme();
  const [eventType, setEventType] = useState<ManualEventType>(MANUAL_EVENT_TYPES[0]!.id);
  const [durationMinutes, setDurationMinutes] = useState('30');
  const [peopleCount, setPeopleCount] = useState('1');

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <View style={styles.chipRow}>
        {MANUAL_EVENT_TYPES.map((t) => {
          const active = t.id === eventType;
          return (
            <Pressable
              key={t.id}
              onPress={() => setEventType(t.id)}
              style={[
                styles.chip,
                {
                  borderColor: theme.border,
                  backgroundColor: active ? theme.primary : 'transparent',
                },
              ]}
            >
              <ThemedText
                type="small"
                style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}
              >
                {t.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.formRow}>
        <View style={styles.formField}>
          <ThemedText type="small" themeColor="textSecondary">
            Minutes
          </ThemedText>
          <TextInput
            value={durationMinutes}
            onChangeText={setDurationMinutes}
            keyboardType="number-pad"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
        </View>
        <View style={styles.formField}>
          <ThemedText type="small" themeColor="textSecondary">
            People
          </ThemedText>
          <TextInput
            value={peopleCount}
            onChangeText={setPeopleCount}
            keyboardType="number-pad"
            style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
          />
        </View>
      </View>
      <Pressable
        onPress={() =>
          onSubmit({
            eventType,
            durationMinutes: Number(durationMinutes) || 0,
            peopleCount: Number(peopleCount) || 1,
          })
        }
        style={[styles.logButton, { backgroundColor: theme.primary, borderColor: theme.border }]}
      >
        <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
          Log it
        </ThemedText>
      </Pressable>
    </View>
  );
}

function CharacteristicCard({
  def,
  totalXp,
  manualProgress,
  onLogEvent,
}: {
  def: CharacteristicDefinition;
  totalXp: number;
  manualProgress?: ManualProgress | null;
  onLogEvent?: (input: EventInput) => void;
}) {
  const theme = useTheme();
  const [formOpen, setFormOpen] = useState(false);
  const level = levelFromXp(totalXp);

  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <View style={styles.cardText}>
          <ThemedText type="smallBold">{def.label}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {def.description}
          </ThemedText>
        </View>
        <View style={[styles.levelBadge, { borderColor: theme.border, backgroundColor: theme.accent }]}>
          <ThemedText type="code" style={styles.levelText}>
            Lv {level.level}
          </ThemedText>
        </View>
      </View>
      <ProgressBar progress={level.progress} />
      <View style={styles.cardFooter}>
        <ThemedText type="small" themeColor="textSecondary">
          {level.xpIntoLevel} / {level.xpForNextLevel} XP
        </ThemedText>
        {onLogEvent && !formOpen && (
          <Pressable onPress={() => setFormOpen(true)} style={[styles.logToggle, { borderColor: theme.border }]}>
            <ThemedText type="small">Log event</ThemedText>
          </Pressable>
        )}
      </View>
      {manualProgress?.lastEventType && !formOpen && (
        <ThemedText type="code" themeColor="textSecondary">
          Last: {EVENT_TYPE_LABEL[manualProgress.lastEventType]} · {manualProgress.lastDurationMinutes}min ·{' '}
          {manualProgress.lastPeopleCount} {manualProgress.lastPeopleCount === 1 ? 'person' : 'people'}
        </ThemedText>
      )}
      {onLogEvent && formOpen && (
        <LogEventForm
          onSubmit={(input) => {
            onLogEvent(input);
            setFormOpen(false);
          }}
        />
      )}
    </ThemedView>
  );
}

export default function ProfileScreen() {
  const { user, signOutUser } = useAuth();
  const theme = useTheme();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [github, setGithub] = useState<DevActivitySummary | null>(null);
  const [gitlab, setGitlab] = useState<DevActivitySummary | null>(null);
  const [focusProgress, setFocusProgress] = useState<ManualProgress | null>(null);
  const [socialProgress, setSocialProgress] = useState<ManualProgress | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    const unsubs = [
      subscribeTasks(db, user.uid, setTasks),
      subscribeSportActivities(db, user.uid, setActivities),
      subscribeDevActivity(db, user.uid, 'github', setGithub),
      subscribeDevActivity(db, user.uid, 'gitlab', setGitlab),
      subscribeManualProgress(db, user.uid, 'focus', setFocusProgress),
      subscribeManualProgress(db, user.uid, 'social', setSocialProgress),
    ];
    return () => unsubs.forEach((u) => u());
  }, [user]);

  const manualProgressByCharacteristic: Record<string, ManualProgress | null> = {
    focus: focusProgress,
    social: socialProgress,
  };

  const coreXp: Record<string, number> = {
    discipline: computeDisciplineXp(tasks),
    fitness: computeFitnessXp(activities),
    craft: computeCraftXp(github, gitlab),
    focus: focusProgress?.xp ?? 0,
    social: socialProgress?.xp ?? 0,
  };

  const xpByCharacteristic: Record<string, number> = Object.fromEntries(
    CHARACTERISTICS.map((def) => [
      def.id,
      def.group === 'core' ? (coreXp[def.id] ?? 0) : computeCategoryXp(tasks, def.id as TaskCategory),
    ]),
  );

  const coreCharacteristics = CHARACTERISTICS.filter((c) => c.group === 'core');
  const categoryCharacteristics = CHARACTERISTICS.filter((c) => c.group === 'category');

  const memberSince = user?.metadata.creationTime
    ? new Date(user.metadata.creationTime).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
      })
    : null;

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.header}>
            <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
              You
            </ThemedText>
            <ThemedText type="subtitle">Profile</ThemedText>
          </View>

          <ThemedView type="backgroundElement" style={[styles.accountCard, { borderColor: theme.border }]}>
            {user?.photoURL && (
              <Image source={{ uri: user.photoURL }} style={[styles.avatar, { borderColor: theme.border }]} />
            )}
            <View style={styles.accountText}>
              <ThemedText type="smallBold">{user?.displayName ?? '—'}</ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {user?.email}
              </ThemedText>
              {memberSince && (
                <ThemedText type="code" themeColor="textSecondary" style={styles.memberSince}>
                  Member since {memberSince}
                </ThemedText>
              )}
            </View>
          </ThemedView>

          <ThemedText type="code" themeColor="primary" style={[styles.eyebrow, styles.sectionTitle]}>
            Core Stats
          </ThemedText>
          <View style={styles.list}>
            {coreCharacteristics.map((def) => (
              <CharacteristicCard
                key={def.id}
                def={def}
                totalXp={xpByCharacteristic[def.id] ?? 0}
                manualProgress={manualProgressByCharacteristic[def.id]}
                onLogEvent={
                  def.source === 'manual' && user && db
                    ? (input) => logManualEvent(db!, user.uid, def.id, input)
                    : undefined
                }
              />
            ))}
          </View>

          <ThemedText type="code" themeColor="primary" style={[styles.eyebrow, styles.sectionTitle]}>
            Task Categories
          </ThemedText>
          <View style={styles.list}>
            {categoryCharacteristics.map((def) => (
              <CharacteristicCard key={def.id} def={def} totalXp={xpByCharacteristic[def.id] ?? 0} />
            ))}
          </View>

          <Pressable onPress={() => signOutUser()} style={styles.signOut}>
            <ThemedText type="small" themeColor="primary">
              Sign out
            </ThemedText>
          </Pressable>
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
  sectionTitle: { marginTop: Spacing.one },
  accountCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.four,
  },
  avatar: { width: 56, height: 56, borderRadius: 28, borderWidth: 2 },
  accountText: { flex: 1, gap: 2 },
  memberSince: { marginTop: Spacing.one, textTransform: 'uppercase' },
  list: { gap: Spacing.three },
  card: { borderWidth: 2, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  cardText: { flex: 1, gap: 2 },
  levelBadge: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  levelText: { fontSize: 11 },
  progressTrack: { height: 10, borderRadius: 999, borderWidth: 2, overflow: 'hidden' },
  progressFill: { height: '100%' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  logToggle: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  logButton: {
    borderWidth: 2,
    borderRadius: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    alignItems: 'center',
  },
  signOut: { alignSelf: 'center', marginTop: Spacing.two, padding: Spacing.two },
  form: { gap: Spacing.two, borderWidth: 2, borderStyle: 'dashed', borderRadius: Spacing.two, padding: Spacing.two },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  formRow: { flexDirection: 'row', gap: Spacing.two },
  formField: { flex: 1, gap: Spacing.half },
  input: { borderWidth: 2, borderRadius: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
});
