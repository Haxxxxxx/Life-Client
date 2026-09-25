import {
  ENDURANCE_EXERCISE_PRESETS,
  STRENGTH_EXERCISE_PRESETS,
  type Challenge,
  type ChallengeMetric,
  type SportActivity,
  type SportActivityKind,
  computeChallengeMilestones,
  computeChallengeProgress,
  createChallenge,
  updateChallenge,
} from '@life-client/shared';
import { data } from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';

function formatDistance(meters?: number): string {
  if (!meters) return '—';
  return `${(meters / 1000).toFixed(2)} km`;
}

function formatDuration(seconds?: number): string {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.round((seconds % 3600) / 60);
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
}

interface LogInput {
  kind: SportActivityKind;
  type: string;
  distanceKm: number;
  durationMin: number;
  reps: number;
  sets: number;
  weightKg: number;
}

function LogActivityForm({ onSubmit }: { onSubmit: (input: LogInput) => void }) {
  const theme = useTheme();
  const [kind, setKind] = useState<SportActivityKind>('endurance');
  const [type, setType] = useState(ENDURANCE_EXERCISE_PRESETS[0]!);
  const [customType, setCustomType] = useState('');
  const [distanceKm, setDistanceKm] = useState('5');
  const [durationMin, setDurationMin] = useState('30');
  const [reps, setReps] = useState('15');
  const [sets, setSets] = useState('3');
  const [weightKg, setWeightKg] = useState('0');

  const presets = kind === 'endurance' ? ENDURANCE_EXERCISE_PRESETS : STRENGTH_EXERCISE_PRESETS;

  function handleKindChange(nextKind: SportActivityKind) {
    setKind(nextKind);
    setCustomType('');
    setType(nextKind === 'endurance' ? ENDURANCE_EXERCISE_PRESETS[0]! : STRENGTH_EXERCISE_PRESETS[0]!);
  }

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <View style={styles.chipRow}>
        {(['endurance', 'strength'] as const).map((k) => {
          const active = k === kind;
          return (
            <Pressable
              key={k}
              onPress={() => handleKindChange(k)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {k === 'endurance' ? 'Endurance' : 'Strength'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.chipRowWrap}>
        {presets.map((p) => {
          const active = p === type && !customType;
          return (
            <Pressable
              key={p}
              onPress={() => {
                setType(p);
                setCustomType('');
              }}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.accent : 'transparent' }]}>
              <ThemedText type="small">{p}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={customType}
        onChangeText={setCustomType}
        placeholder="Or type your own…"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />

      {kind === 'endurance' ? (
        <View style={styles.formRow}>
          <View style={styles.formField}>
            <ThemedText type="small" themeColor="textSecondary">
              Distance (km)
            </ThemedText>
            <TextInput
              value={distanceKm}
              onChangeText={setDistanceKm}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
          </View>
          <View style={styles.formField}>
            <ThemedText type="small" themeColor="textSecondary">
              Duration (min)
            </ThemedText>
            <TextInput
              value={durationMin}
              onChangeText={setDurationMin}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
          </View>
        </View>
      ) : (
        <View style={styles.formRow}>
          <View style={styles.formField}>
            <ThemedText type="small" themeColor="textSecondary">
              Reps
            </ThemedText>
            <TextInput
              value={reps}
              onChangeText={setReps}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
          </View>
          <View style={styles.formField}>
            <ThemedText type="small" themeColor="textSecondary">
              Sets
            </ThemedText>
            <TextInput
              value={sets}
              onChangeText={setSets}
              keyboardType="number-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
          </View>
          <View style={styles.formField}>
            <ThemedText type="small" themeColor="textSecondary">
              Weight (kg)
            </ThemedText>
            <TextInput
              value={weightKg}
              onChangeText={setWeightKg}
              keyboardType="decimal-pad"
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
          </View>
        </View>
      )}

      <Pressable
        onPress={() =>
          onSubmit({
            kind,
            type: customType.trim() || type,
            distanceKm: Number(distanceKm) || 0,
            durationMin: Number(durationMin) || 0,
            reps: Number(reps) || 0,
            sets: Number(sets) || 0,
            weightKg: Number(weightKg) || 0,
          })
        }
        style={[styles.logButton, { backgroundColor: theme.primary, borderColor: theme.border }]}>
        <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
          Log it
        </ThemedText>
      </Pressable>
    </View>
  );
}

const METRICS: { id: ChallengeMetric; label: string }[] = [
  { id: 'reps', label: 'Reps/day' },
  { id: 'distanceMeters', label: 'Distance/day' },
  { id: 'sessions', label: 'Session/day' },
];

// Distance-based sports (Running, Cycling, Swimming) only make sense as
// distance or session challenges — "100 days of 100 Running" (reps) doesn't.
// Strength sports only make sense as reps or session challenges.
const METRICS_FOR_KIND: Record<SportActivityKind, ChallengeMetric[]> = {
  endurance: ['distanceMeters', 'sessions'],
  strength: ['reps', 'sessions'],
};
const DEFAULT_METRIC_FOR_KIND: Record<SportActivityKind, ChallengeMetric> = {
  endurance: 'distanceMeters',
  strength: 'reps',
};
const DEFAULT_TARGET_FOR_METRIC: Record<ChallengeMetric, string> = {
  reps: '100',
  distanceMeters: '5', // km — converted to meters (Challenge.dailyTarget's storage unit) at submit
  sessions: '1',
};

function metricUnitLabel(metric: ChallengeMetric): string {
  return metric === 'distanceMeters' ? 'km' : metric === 'sessions' ? 'sessions' : 'reps';
}

/** Formats a raw stored value (meters for distance, count otherwise) for display. */
function formatMetricValue(metric: ChallengeMetric, value: number): string {
  if (metric === 'distanceMeters') {
    const km = value / 1000;
    return `${km % 1 === 0 ? km.toFixed(0) : km.toFixed(2)}km`;
  }
  if (metric === 'sessions') return `${value} ${value === 1 ? 'session' : 'sessions'}`;
  return `${value} reps`;
}

function buildChallengeTitle(durationDays: number, metric: ChallengeMetric, dailyTargetDisplay: number, type: string): string {
  if (metric === 'sessions') return `${durationDays} Days of ${type}`;
  const target = dailyTargetDisplay % 1 === 0 ? dailyTargetDisplay.toFixed(0) : dailyTargetDisplay.toFixed(1);
  return `${durationDays} Days of ${target}${metric === 'distanceMeters' ? 'km' : ''} ${type}`;
}

function todayLocalDate(): string {
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function ChallengeForm({ onSubmit }: { onSubmit: (input: Parameters<typeof createChallenge>[2]) => void }) {
  const theme = useTheme();
  const [kind, setKind] = useState<SportActivityKind>('endurance');
  const [exerciseType, setExerciseType] = useState(ENDURANCE_EXERCISE_PRESETS[0]!);
  const [customType, setCustomType] = useState('');
  const [metric, setMetric] = useState<ChallengeMetric>('distanceMeters');
  const [dailyTarget, setDailyTarget] = useState(DEFAULT_TARGET_FOR_METRIC.distanceMeters);
  const [durationDays, setDurationDays] = useState('100');
  const [startDate, setStartDate] = useState(todayLocalDate());

  const type = customType.trim() || exerciseType;
  const presets = kind === 'endurance' ? ENDURANCE_EXERCISE_PRESETS : STRENGTH_EXERCISE_PRESETS;
  const availableMetrics = METRICS.filter((m) => METRICS_FOR_KIND[kind].includes(m.id));

  function handleKindChange(nextKind: SportActivityKind) {
    setKind(nextKind);
    setCustomType('');
    setExerciseType(nextKind === 'endurance' ? ENDURANCE_EXERCISE_PRESETS[0]! : STRENGTH_EXERCISE_PRESETS[0]!);
    const nextMetric = DEFAULT_METRIC_FOR_KIND[nextKind];
    setMetric(nextMetric);
    setDailyTarget(DEFAULT_TARGET_FOR_METRIC[nextMetric]);
  }

  function handleMetricChange(nextMetric: ChallengeMetric) {
    setMetric(nextMetric);
    setDailyTarget(DEFAULT_TARGET_FOR_METRIC[nextMetric]);
  }

  return (
    <View style={[styles.form, { borderColor: theme.border }]}>
      <View style={styles.chipRow}>
        {(['endurance', 'strength'] as const).map((k) => {
          const active = k === kind;
          return (
            <Pressable
              key={k}
              onPress={() => handleKindChange(k)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {k === 'endurance' ? 'Endurance' : 'Strength'}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.chipRowWrap}>
        {presets.map((p) => {
          const active = p === exerciseType && !customType;
          return (
            <Pressable
              key={p}
              onPress={() => {
                setExerciseType(p);
                setCustomType('');
              }}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.accent : 'transparent' }]}>
              <ThemedText type="small">{p}</ThemedText>
            </Pressable>
          );
        })}
      </View>
      <TextInput
        value={customType}
        onChangeText={setCustomType}
        placeholder="Or type your own…"
        placeholderTextColor={theme.textSecondary}
        style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
      />
      <View style={styles.chipRow}>
        {availableMetrics.map((m) => {
          const active = m.id === metric;
          return (
            <Pressable
              key={m.id}
              onPress={() => handleMetricChange(m.id)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' }]}>
              <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                {m.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.formRow}>
        <View style={styles.formField}>
          <ThemedText type="small" themeColor="textSecondary">
            Daily target ({metricUnitLabel(metric)})
          </ThemedText>
          <TextInput
            value={dailyTarget}
            onChangeText={setDailyTarget}
            keyboardType={metric === 'distanceMeters' ? 'decimal-pad' : 'number-pad'}
            style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
          />
        </View>
        <View style={styles.formField}>
          <ThemedText type="small" themeColor="textSecondary">
            Duration (days)
          </ThemedText>
          <TextInput
            value={durationDays}
            onChangeText={setDurationDays}
            keyboardType="number-pad"
            style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
          />
        </View>
        <View style={styles.formField}>
          <ThemedText type="small" themeColor="textSecondary">
            Start date
          </ThemedText>
          <TextInput
            value={startDate}
            onChangeText={setStartDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={theme.textSecondary}
            style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
          />
        </View>
      </View>
      <Pressable
        onPress={() => {
          const dailyTargetDisplay = Number(dailyTarget) || 1;
          onSubmit({
            title: buildChallengeTitle(Number(durationDays) || 1, metric, dailyTargetDisplay, type),
            exerciseType: type,
            metric,
            dailyTarget: metric === 'distanceMeters' ? Math.round(dailyTargetDisplay * 1000) : dailyTargetDisplay,
            durationDays: Number(durationDays) || 1,
            startDate,
          });
        }}
        style={[styles.logButton, { backgroundColor: theme.primary, borderColor: theme.border }]}>
        <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
          Start challenge
        </ThemedText>
      </Pressable>
    </View>
  );
}

function ChallengeCard({
  challenge,
  activities,
  onArchive,
  onDelete,
  onSave,
  onLogToday,
}: {
  challenge: Challenge;
  activities: SportActivity[];
  onArchive: () => void;
  onDelete: () => void;
  onSave: (patch: Parameters<typeof updateChallenge>[3]) => void;
  onLogToday: () => void;
}) {
  const theme = useTheme();
  const progress = computeChallengeProgress(challenge, activities);
  const milestones = computeChallengeMilestones(challenge, progress);
  const today = todayLocalDate();
  const todayEntry = progress.days.find((d) => d.date === today);
  const canLogToday = !progress.isFinished && challenge.startDate <= today && !todayEntry?.completed;

  // Daily target is stored in canonical units (meters for distance); edited/displayed in km for readability.
  const dailyTargetToDisplay = (raw: number) => (challenge.metric === 'distanceMeters' ? raw / 1000 : raw);
  const dailyTargetToStored = (display: number) => (challenge.metric === 'distanceMeters' ? Math.round(display * 1000) : display);

  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(challenge.title);
  const [dailyTarget, setDailyTarget] = useState(String(dailyTargetToDisplay(challenge.dailyTarget)));
  const [durationDays, setDurationDays] = useState(String(challenge.durationDays));

  function startEdit() {
    setTitle(challenge.title);
    setDailyTarget(String(dailyTargetToDisplay(challenge.dailyTarget)));
    setDurationDays(String(challenge.durationDays));
    setEditing(true);
  }

  function save() {
    onSave({
      title: title.trim() || challenge.title,
      dailyTarget: Number(dailyTarget) ? dailyTargetToStored(Number(dailyTarget)) : challenge.dailyTarget,
      durationDays: Number(durationDays) || challenge.durationDays,
    });
    setEditing(false);
  }

  return (
    <ThemedView type="backgroundElement" style={[styles.challengeCard, { borderColor: theme.border }]}>
      <View style={styles.challengeHeaderRow}>
        {editing ? (
          <View style={{ flex: 1, gap: Spacing.one }}>
            <TextInput
              value={title}
              onChangeText={setTitle}
              style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
            />
            <View style={styles.formRow}>
              <View style={styles.formField}>
                <ThemedText type="small" themeColor="textSecondary">
                  Daily target ({metricUnitLabel(challenge.metric)})
                </ThemedText>
                <TextInput
                  value={dailyTarget}
                  onChangeText={setDailyTarget}
                  keyboardType={challenge.metric === 'distanceMeters' ? 'decimal-pad' : 'number-pad'}
                  style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
                />
              </View>
              <View style={styles.formField}>
                <ThemedText type="small" themeColor="textSecondary">
                  Duration (days)
                </ThemedText>
                <TextInput
                  value={durationDays}
                  onChangeText={setDurationDays}
                  keyboardType="number-pad"
                  style={[styles.input, { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background }]}
                />
              </View>
            </View>
            <View style={styles.challengeActions}>
              <Pressable onPress={save}>
                <ThemedText type="small" themeColor="primary" style={{ fontWeight: '700' }}>
                  Save
                </ThemedText>
              </Pressable>
              <Pressable onPress={() => setEditing(false)}>
                <ThemedText type="small" themeColor="textSecondary">
                  Cancel
                </ThemedText>
              </Pressable>
            </View>
          </View>
        ) : (
          <Pressable style={{ flex: 1 }} onPress={startEdit}>
            <ThemedText type="smallBold">{challenge.title}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {challenge.exerciseType} · {formatMetricValue(challenge.metric, challenge.dailyTarget)}/day
            </ThemedText>
          </Pressable>
        )}
        {!editing && (
          <View style={styles.challengeActions}>
            <Pressable onPress={onArchive}>
              <ThemedText type="small" themeColor="textSecondary">
                Archive
              </ThemedText>
            </Pressable>
            <Pressable onPress={onDelete}>
              <ThemedText type="small" style={styles.deleteText}>
                Delete
              </ThemedText>
            </Pressable>
          </View>
        )}
      </View>
      <View style={styles.challengeStatsRow}>
        <View style={styles.stat}>
          <ThemedText type="smallBold" themeColor="primary">
            {progress.currentStreak}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            current streak
          </ThemedText>
        </View>
        <View style={styles.stat}>
          <ThemedText type="smallBold">{progress.longestStreak}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            longest streak
          </ThemedText>
        </View>
        <View style={styles.stat}>
          <ThemedText type="smallBold">
            {progress.completedCount}/{challenge.durationDays}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            days completed
          </ThemedText>
        </View>
        {canLogToday && (
          <Pressable
            onPress={onLogToday}
            style={[styles.logTodayButton, { backgroundColor: theme.primary, borderColor: theme.border }]}>
            <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
              Log today
            </ThemedText>
          </Pressable>
        )}
        {!progress.isFinished && todayEntry?.completed && (
          <View style={[styles.doneTodayBadge, { borderColor: theme.border, backgroundColor: theme.primary }]}>
            <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
              Done today
            </ThemedText>
          </View>
        )}
      </View>
      <View style={styles.milestoneRow}>
        {milestones.map((m) => (
          <View
            key={m.thresholdPercent}
            style={[
              styles.milestoneChip,
              {
                borderColor: m.achieved ? theme.primary : theme.border,
                backgroundColor: m.achieved ? theme.primary : 'transparent',
              },
            ]}>
            <ThemedText
              type="small"
              style={m.achieved ? { color: theme.primaryForeground, fontWeight: '700' } : { color: theme.textSecondary }}>
              {m.label}
            </ThemedText>
          </View>
        ))}
      </View>
      <View style={styles.dayGrid}>
        {progress.days.map((day) => (
          <View
            key={day.date}
            style={[
              styles.daySquare,
              {
                borderColor: day.completed ? theme.primary : theme.border,
                backgroundColor: day.completed ? theme.primary : 'transparent',
              },
            ]}
          />
        ))}
      </View>
    </ThemedView>
  );
}

function ChallengesSection({ activities }: { activities: SportActivity[] }) {
  const { user } = useAuth();
  const theme = useTheme();
  const [challenges, setChallenges] = useState<Challenge[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeChallenges(user.uid, setChallenges, (err) => setError(err.message));
  }, [user]);

  async function handleCreate(input: Parameters<typeof createChallenge>[2]) {
    if (!user) return;
    setError(null);
    try {
      await data.createChallenge(user.uid, input);
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not start challenge');
    }
  }

  // Logs an activity that matches this challenge's own exerciseType/metric —
  // avoids the user having to guess the exact type string themselves.
  async function handleLogToday(challenge: Challenge) {
    if (!user) return;
    setError(null);
    const kind: SportActivityKind = challenge.metric === 'distanceMeters' ? 'endurance' : 'strength';
    try {
      await data.createManualSportActivity(user.uid, {
        kind,
        type: challenge.exerciseType,
        name: challenge.exerciseType,
        startDate: new Date().toISOString(),
        ...(kind === 'endurance'
          ? { distanceMeters: challenge.dailyTarget }
          : { reps: challenge.metric === 'reps' ? challenge.dailyTarget : 1, sets: 1 }),
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log today');
    }
  }

  const activeChallenges = challenges.filter((c) => !c.archived);

  return (
    <View style={styles.challengesSection}>
      <View style={styles.headerRow}>
        <View style={styles.headerText}>
          <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
            Streaks
          </ThemedText>
          <ThemedText type="subtitle">Challenges</ThemedText>
        </View>
        {!formOpen && (
          <Pressable
            onPress={() => setFormOpen(true)}
            style={[styles.logToggle, { borderColor: theme.border }]}>
            <ThemedText type="small" style={{ fontWeight: '700' }}>
              New challenge
            </ThemedText>
          </Pressable>
        )}
      </View>
      {formOpen && <ChallengeForm onSubmit={handleCreate} />}
      {error && (
        <ThemedText themeColor="text" style={styles.error}>
          {error}
        </ThemedText>
      )}
      {activeChallenges.length > 0 ? (
        <View style={{ gap: Spacing.two }}>
          {activeChallenges.map((challenge) => (
            <ChallengeCard
              key={challenge.id}
              challenge={challenge}
              activities={activities}
              onArchive={() => user && data.archiveChallenge(user.uid, challenge.id)}
              onDelete={() => user && data.deleteChallenge(user.uid, challenge.id)}
              onSave={(patch) => user && data.updateChallenge(user.uid, challenge.id, patch)}
              onLogToday={() => handleLogToday(challenge)}
            />
          ))}
        </View>
      ) : (
        !formOpen && (
          <ThemedView type="backgroundElement" style={styles.emptyState}>
            <ThemedText themeColor="textSecondary">
              No active challenges — e.g. &ldquo;100 days of 100 push-ups&rdquo;. Completion is tracked
              automatically from activities you log below.
            </ThemedText>
          </ThemedView>
        )
      )}
    </View>
  );
}

export default function SportsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) return;
    return data.subscribeSportActivities(user.uid, setActivities);
  }, [user]);

  async function handleLog(input: LogInput) {
    if (!user) return;
    setError(null);
    try {
      await data.createManualSportActivity(user.uid, {
        kind: input.kind,
        type: input.type,
        name: input.type,
        startDate: new Date().toISOString(),
        ...(input.kind === 'endurance'
          ? { distanceMeters: input.distanceKm * 1000, movingTimeSec: input.durationMin * 60 }
          : { reps: input.reps, sets: input.sets, weightKg: input.weightKg || undefined }),
      });
      setFormOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log activity');
    }
  }

  return (
    <ThemedView style={styles.screen}>
      <SafeAreaView style={styles.safeArea} edges={['top']}>
        <View style={styles.header}>
          <View style={styles.headerRow}>
            <View style={styles.headerText}>
              <ThemedText type="code" themeColor="primary" style={styles.eyebrow}>
                Performance
              </ThemedText>
              <ThemedText type="subtitle">Sports</ThemedText>
            </View>
            {!formOpen && (
              <Pressable
                onPress={() => setFormOpen(true)}
                style={[styles.logToggle, { backgroundColor: theme.primary, borderColor: theme.border }]}>
                <ThemedText type="small" style={{ color: theme.primaryForeground, fontWeight: '700' }}>
                  Log activity
                </ThemedText>
              </Pressable>
            )}
          </View>
          <ThemedText themeColor="textSecondary">Synced from Strava, or logged by hand.</ThemedText>
        </View>

        {formOpen && <LogActivityForm onSubmit={handleLog} />}
        {error && (
          <ThemedText themeColor="text" style={styles.error}>
            {error}
          </ThemedText>
        )}

        <FlatList
          data={activities}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={<ChallengesSection activities={activities} />}
          ListEmptyComponent={
            <ThemedView type="backgroundElement" style={styles.emptyState}>
              <ThemedText themeColor="textSecondary">
                No activities yet. Connect Strava from the Integrations tab, or log one by hand above.
              </ThemedText>
            </ThemedView>
          }
          renderItem={({ item }) => (
            <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
              <View style={styles.info}>
                <ThemedText type="smallBold" numberOfLines={1}>
                  {item.name}
                </ThemedText>
                <ThemedText type="small" themeColor="textSecondary">
                  {item.type} · {new Date(item.startDate).toLocaleDateString()} ·{' '}
                  {item.provider === 'manual' ? 'Manual' : 'Strava'}
                </ThemedText>
              </View>
              <View style={styles.stats}>
                {item.kind === 'strength' ? (
                  <View style={styles.stat}>
                    <ThemedText type="smallBold" themeColor="primary">
                      {item.reps ?? 0} × {item.sets ?? 1}
                      {item.weightKg ? ` · ${item.weightKg}kg` : ''}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      reps × sets
                    </ThemedText>
                  </View>
                ) : (
                  <>
                    <View style={styles.stat}>
                      <ThemedText type="smallBold" themeColor="primary">
                        {formatDistance(item.distanceMeters)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        distance
                      </ThemedText>
                    </View>
                    <View style={styles.stat}>
                      <ThemedText type="smallBold" themeColor="primary">
                        {formatDuration(item.movingTimeSec)}
                      </ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        time
                      </ThemedText>
                    </View>
                  </>
                )}
                {item.provider === 'manual' && user && (
                  <Pressable onPress={() => data.deleteSportActivity(user.uid, item.id)}>
                    <ThemedText type="small" style={styles.deleteText}>
                      Delete
                    </ThemedText>
                  </Pressable>
                )}
              </View>
            </ThemedView>
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
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  headerText: { flex: 1, gap: Spacing.one },
  eyebrow: { letterSpacing: 2, textTransform: 'uppercase' },
  logToggle: { borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  error: { marginTop: Spacing.two },
  listContent: { paddingVertical: Spacing.four, gap: Spacing.two },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 1,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  info: { flex: 1, gap: 2, minWidth: 0 },
  stats: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  stat: { alignItems: 'flex-end' },
  deleteText: { color: '#dc2626' },
  form: { gap: Spacing.two, borderWidth: 1, borderStyle: 'dashed', borderRadius: Spacing.two, padding: Spacing.two, marginTop: Spacing.three },
  chipRow: { flexDirection: 'row', gap: Spacing.one },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  formRow: { flexDirection: 'row', gap: Spacing.two },
  formField: { flex: 1, gap: Spacing.half },
  input: { borderWidth: 1, borderRadius: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  logButton: { borderWidth: 1, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
  challengesSection: { gap: Spacing.two, marginBottom: Spacing.four },
  challengeCard: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.two },
  challengeHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: Spacing.two },
  challengeActions: { flexDirection: 'row', gap: Spacing.two },
  challengeStatsRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.four },
  logTodayButton: { marginLeft: 'auto', borderWidth: 1, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  doneTodayBadge: { marginLeft: 'auto', borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
  dayGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
  daySquare: { width: 10, height: 10, borderRadius: 2, borderWidth: 1 },
  milestoneRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  milestoneChip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: 2 },
});
