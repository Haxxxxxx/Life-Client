import { toDateStr } from '@life-client/shared';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { BarChart, PieChart, type barDataItem, type stackDataItem } from 'react-native-gifted-charts';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/** Appends an alpha channel to a 6-digit hex color — the palette has one accent, so series are told apart by tint, not hue. */
export function withAlpha(hex: string, alpha: number): string {
  const byte = Math.round(Math.max(0, Math.min(1, alpha)) * 255);
  return `${hex.slice(0, 7)}${byte.toString(16).padStart(2, '0')}`;
}

/** The last `count` local calendar days (oldest first) as YYYY-MM-DD, matching toDateStr bucketing. */
export function lastNDays(count: number, now: Date = new Date()): string[] {
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (count - 1 - i));
    return toDateStr(d);
  });
}

/** Counts ISO timestamps per local day, index-aligned with `days` (from lastNDays). */
export function countPerDay(timestamps: string[], days: string[]): number[] {
  const index = new Map(days.map((d, i) => [d, i]));
  const counts = days.map(() => 0);
  for (const ts of timestamps) {
    const i = index.get(toDateStr(new Date(ts)));
    if (i !== undefined) counts[i]! += 1;
  }
  return counts;
}

// A single narrow-format letter collides for two weekday pairs in English
// (Tue/Thu both "T", Sat/Sun both "S") — a 2-letter prefix of the short name
// disambiguates ("Tu"/"Th", "Sa"/"Su") while staying compact and locale-aware.
export function weekdayInitial(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y!, m! - 1, d!).toLocaleDateString(undefined, { weekday: 'short' }).slice(0, 2);
}

export function ChartCard({ title, summary, children }: { title: string; summary?: string; children: ReactNode }) {
  const theme = useTheme();
  return (
    <ThemedView type="backgroundElement" style={[styles.card, { borderColor: theme.border }]}>
      <View style={styles.cardHeader}>
        <ThemedText type="code" themeColor="textSecondary" style={styles.cardTitle}>
          {title}
        </ThemedText>
        {summary && (
          <ThemedText type="code" themeColor="text">
            {summary}
          </ThemedText>
        )}
      </View>
      {children}
    </ThemedView>
  );
}

export interface LegendItem {
  label: string;
  color: string;
  value?: string;
}

export function Legend({ items, vertical = false }: { items: LegendItem[]; vertical?: boolean }) {
  return (
    <View style={vertical ? styles.legendColumn : styles.legendRow}>
      {items.map((item) => (
        <View key={item.label} style={styles.legendItem}>
          <View style={[styles.legendDot, { backgroundColor: item.color }]} />
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={vertical ? styles.legendLabelFill : undefined}>
            {item.label}
          </ThemedText>
          {item.value !== undefined && (
            <ThemedText type="code" themeColor="text">
              {item.value}
            </ThemedText>
          )}
        </View>
      ))}
    </View>
  );
}

export interface BarGroup {
  label: string;
  values: number[];
}

/**
 * Minimal bar chart: no y-axis, no rules, a single hairline baseline. `values`
 * in each group are index-aligned with `colors`; "stacked" piles them into one
 * bar, "grouped" places them side by side.
 */
export function BarTrend({
  groups,
  colors,
  layout = 'stacked',
  height = 112,
}: {
  groups: BarGroup[];
  colors: string[];
  layout?: 'stacked' | 'grouped';
  height?: number;
}) {
  const theme = useTheme();
  const [width, setWidth] = useState(0);

  const totals = groups.map((g) => (layout === 'stacked' ? g.values.reduce((a, b) => a + b, 0) : Math.max(0, ...g.values)));
  // Headroom so the tallest bar never kisses the top edge; floor of 1 keeps an all-zero chart from dividing by zero.
  const maxValue = Math.max(1, ...totals) * 1.1;
  const labelStyle = { color: theme.textSecondary, fontSize: 10 };

  const slot = width / Math.max(1, groups.length);
  const common = {
    height,
    width,
    maxValue,
    noOfSections: 1,
    hideRules: true,
    hideYAxisText: true,
    yAxisLabelWidth: 0,
    yAxisThickness: 0,
    xAxisThickness: 1,
    xAxisColor: theme.borderStrong,
    xAxisLabelTextStyle: labelStyle,
    disableScroll: true,
    disablePress: true,
    endSpacing: 0,
  };

  let chart: ReactNode = null;
  if (width > 0 && layout === 'stacked') {
    const barWidth = Math.max(4, slot * 0.56);
    const spacing = slot - barWidth;
    const stackData: stackDataItem[] = groups.map((g) => ({
      label: g.label,
      stacks: g.values.map((value, i) => ({ value, color: colors[i], marginBottom: i === 0 ? 0 : 1, borderRadius: 2 })),
    }));
    chart = <BarChart {...common} stackData={stackData} barWidth={barWidth} spacing={spacing} initialSpacing={spacing / 2} />;
  } else if (width > 0) {
    const perGroup = Math.max(1, colors.length);
    const innerGap = 2;
    const groupWidth = slot * 0.62;
    const barWidth = Math.max(3, (groupWidth - innerGap * (perGroup - 1)) / perGroup);
    const groupGap = slot - groupWidth;
    const barData: barDataItem[] = groups.flatMap((g) =>
      g.values.map((value, i) => ({
        value,
        frontColor: colors[i],
        spacing: i === perGroup - 1 ? groupGap : innerGap,
        ...(i === 0 ? { label: g.label, labelWidth: groupWidth } : {}),
      })),
    );
    chart = (
      <BarChart
        {...common}
        data={barData}
        barWidth={barWidth}
        spacing={groupGap}
        barBorderTopLeftRadius={2}
        barBorderTopRightRadius={2}
        initialSpacing={groupGap / 2}
      />
    );
  }

  return (
    <View onLayout={(e) => setWidth(Math.floor(e.nativeEvent.layout.width))} style={{ minHeight: height + 24 }}>
      {chart}
    </View>
  );
}

export interface DonutSlice {
  label: string;
  value: number;
  color: string;
}

export function Donut({
  slices,
  centerValue,
  centerCaption,
  formatValue = String,
  size = 128,
}: {
  slices: DonutSlice[];
  centerValue: string;
  centerCaption: string;
  formatValue?: (value: number) => string;
  size?: number;
}) {
  const theme = useTheme();
  const visible = slices.filter((s) => s.value > 0);
  const total = visible.reduce((sum, s) => sum + s.value, 0);
  const radius = size / 2;

  return (
    <View style={styles.donutRow}>
      <PieChart
        donut
        data={visible.map((s) => ({ value: s.value, color: s.color }))}
        radius={radius}
        innerRadius={radius - 14}
        innerCircleColor={theme.backgroundElement}
        // Slice gaps are drawn in the card color so segments read as separate without extra hues.
        strokeColor={theme.backgroundElement}
        strokeWidth={visible.length > 1 ? 2 : 0}
        centerLabelComponent={() => (
          <View style={styles.donutCenter}>
            <ThemedText type="smallBold">{centerValue}</ThemedText>
            <ThemedText type="code" themeColor="textSecondary" style={styles.donutCaption}>
              {centerCaption}
            </ThemedText>
          </View>
        )}
      />
      <View style={styles.donutLegend}>
        <Legend
          vertical
          items={visible.map((s) => ({
            label: s.label,
            color: s.color,
            value: `${formatValue(s.value)} · ${Math.round((s.value / total) * 100)}%`,
          }))}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Spacing.three, padding: Spacing.three, gap: Spacing.three },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: Spacing.two },
  cardTitle: { letterSpacing: 1.5, textTransform: 'uppercase', flexShrink: 1 },
  legendRow: { flexDirection: 'row', flexWrap: 'wrap', columnGap: Spacing.three, rowGap: Spacing.one },
  legendColumn: { gap: Spacing.one },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  legendDot: { width: 8, height: 8, borderRadius: 2 },
  legendLabelFill: { flex: 1 },
  donutRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  donutCenter: { alignItems: 'center' },
  donutCaption: { fontSize: 10, textTransform: 'uppercase', letterSpacing: 0.5 },
  donutLegend: { flex: 1, minWidth: 0 },
});
