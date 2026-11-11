import { WEEKDAY_LABELS, type Recurrence, type RecurrenceFreq } from '@life-client/shared';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * Frequency / interval / weekday picker for a recurrence rule.
 *
 * This existed three times — in tasks.tsx, index.tsx and money.tsx — at about
 * eighty lines each, together with the five style definitions each copy
 * needed. They differed only in the label for "does not repeat" (money said
 * "One-time", which reads better for a transaction) and in which of two
 * identically-shaped row styles they referenced.
 *
 * One deliberate behavioural change came out of merging them. money.tsx's
 * picker used its local `chipRow`, which — unlike index.tsx's style of the
 * same name — had no `flexWrap`. Four frequency chips plus seven weekday
 * chips do not fit across a phone, so on that screen they could run off the
 * edge instead of wrapping onto a second line. The shared row wraps, matching
 * the two screens that already did.
 */
export function RecurrencePicker({
  value,
  onChange,
  noneLabel = 'No repeat',
}: {
  value: Recurrence | undefined;
  onChange: (next: Recurrence | undefined) => void;
  /** Wording for the "does not repeat" option — "One-time" reads better for a transaction. */
  noneLabel?: string;
}) {
  const theme = useTheme();
  const freq = value?.freq;
  const interval = value?.interval ?? 1;
  const daysOfWeek = value?.daysOfWeek ?? [];

  function setFreq(next: RecurrenceFreq | undefined) {
    if (!next) {
      onChange(undefined);
      return;
    }
    onChange({ freq: next, interval, daysOfWeek: next === 'weekly' ? daysOfWeek : undefined });
  }

  function toggleDay(day: number) {
    const next = daysOfWeek.includes(day) ? daysOfWeek.filter((d) => d !== day) : [...daysOfWeek, day];
    onChange({ freq: 'weekly', interval, daysOfWeek: next });
  }

  return (
    <View style={{ gap: Spacing.one }}>
      <View style={styles.chipRow}>
        {(['none', 'daily', 'weekly', 'monthly'] as const).map((f) => {
          const active = (f === 'none' && !freq) || f === freq;
          return (
            <Pressable
              key={f}
              onPress={() => setFreq(f === 'none' ? undefined : f)}
              style={[styles.chip, { borderColor: theme.border, backgroundColor: active ? theme.accent : 'transparent' }]}>
              <ThemedText type="small" style={active ? { fontWeight: '700' } : undefined}>
                {f === 'none' ? noneLabel : f}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
      {freq && (
        <View style={styles.recurrenceIntervalRow}>
          <ThemedText type="small" themeColor="textSecondary">
            every
          </ThemedText>
          <TextInput
            value={String(interval)}
            onChangeText={(text) => onChange({ freq, interval: Number(text) || 1, daysOfWeek: value?.daysOfWeek })}
            keyboardType="number-pad"
            style={[
              styles.intervalInput,
              { color: theme.text, borderColor: theme.borderStrong, backgroundColor: theme.background },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {freq === 'daily' ? 'day(s)' : freq === 'weekly' ? 'week(s)' : 'month(s)'}
          </ThemedText>
        </View>
      )}
      {freq === 'weekly' && (
        <View style={styles.chipRow}>
          {WEEKDAY_LABELS.map((label, i) => {
            const active = daysOfWeek.includes(i);
            return (
              <Pressable
                key={i}
                onPress={() => toggleDay(i)}
                style={[
                  styles.weekdayChip,
                  { borderColor: theme.border, backgroundColor: active ? theme.primary : 'transparent' },
                ]}>
                <ThemedText type="small" style={active ? { color: theme.primaryForeground, fontWeight: '700' } : undefined}>
                  {label}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
      )}
    </View>
  );
}

// Copied verbatim from the three screens' stylesheets, which defined these
// identically.
const styles = StyleSheet.create({
  chip: { borderWidth: 1, borderRadius: 999, paddingHorizontal: Spacing.two, paddingVertical: Spacing.half },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  intervalInput: {
    width: 44,
    borderWidth: 1,
    borderRadius: Spacing.half,
    paddingHorizontal: Spacing.one,
    paddingVertical: 2,
  },
  recurrenceIntervalRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  weekdayChip: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: Spacing.one + Spacing.half,
    paddingVertical: Spacing.half,
  },
});
