import {
  ENDURANCE_EXERCISE_PRESETS,
  STRENGTH_EXERCISE_PRESETS,
  type SportActivity,
  type SportActivityKind,
  createManualSportActivity,
  deleteSportActivity,
  subscribeSportActivities,
} from '@life-client/shared';
import { useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useAuth } from '@/lib/auth-context';
import { db } from '@/lib/firebase';

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
        style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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
              style={[styles.input, { color: theme.text, borderColor: theme.border, backgroundColor: theme.background }]}
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

export default function SportsScreen() {
  const { user } = useAuth();
  const theme = useTheme();
  const [activities, setActivities] = useState<SportActivity[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user || !db) return;
    return subscribeSportActivities(db, user.uid, setActivities);
  }, [user]);

  async function handleLog(input: LogInput) {
    if (!user || !db) return;
    setError(null);
    try {
      await createManualSportActivity(db, user.uid, {
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
                {item.provider === 'manual' && user && db && (
                  <Pressable onPress={() => deleteSportActivity(db!, user.uid, item.id)}>
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
  logToggle: { borderWidth: 2, borderRadius: Spacing.two, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one },
  error: { marginTop: Spacing.two },
  listContent: { paddingVertical: Spacing.four, gap: Spacing.two },
  emptyState: { borderRadius: Spacing.three, padding: Spacing.five, alignItems: 'center' },
  card: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: Spacing.two,
    borderWidth: 2,
    borderRadius: Spacing.three,
    padding: Spacing.three,
  },
  info: { flex: 1, gap: 2, minWidth: 0 },
  stats: { flexDirection: 'row', gap: Spacing.three, alignItems: 'center' },
  stat: { alignItems: 'flex-end' },
  deleteText: { color: '#dc2626' },
  form: { gap: Spacing.two, borderWidth: 2, borderStyle: 'dashed', borderRadius: Spacing.two, padding: Spacing.two, marginTop: Spacing.three },
  chipRow: { flexDirection: 'row', gap: Spacing.one },
  chipRowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { borderWidth: 2, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  formRow: { flexDirection: 'row', gap: Spacing.two },
  formField: { flex: 1, gap: Spacing.half },
  input: { borderWidth: 2, borderRadius: Spacing.one, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  logButton: { borderWidth: 2, borderRadius: Spacing.two, paddingVertical: Spacing.two, alignItems: 'center' },
});
