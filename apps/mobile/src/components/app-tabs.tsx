import { usePathname } from 'expo-router';
import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Children, useEffect, useRef } from 'react';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { name: 'index', href: '/', label: 'Dashboard' },
  { name: 'search', href: '/search', label: 'Search' },
  { name: 'tasks', href: '/tasks', label: 'Tasks' },
  { name: 'goals', href: '/goals', label: 'Goals' },
  { name: 'sports', href: '/sports', label: 'Sports' },
  { name: 'agenda', href: '/agenda', label: 'Agenda' },
  { name: 'music', href: '/music', label: 'Music' },
  { name: 'money', href: '/money', label: 'Money' },
  { name: 'integrations', href: '/integrations', label: 'Integrations' },
  { name: 'knowledge', href: '/knowledge', label: 'Knowledge' },
  { name: 'profile', href: '/profile', label: 'Profile' },
] as const;

// A fully custom tab bar (not the OS-native UITabBar/BottomNavigation) so it can
// scroll horizontally with an arbitrary number of tabs — native tab bars have no
// scrolling mode and silently demote anything past ~5 items into a "More" menu.
export default function AppTabs() {
  return (
    <Tabs style={styles.tabs}>
      <TabSlot style={styles.slot} />
      <TabList asChild>
        <CustomTabList>
          {TABS.map((tab) => (
            <TabTrigger key={tab.name} name={tab.name} href={tab.href} asChild>
              <TabButton>{tab.label}</TabButton>
            </TabTrigger>
          ))}
        </CustomTabList>
      </TabList>
    </Tabs>
  );
}

export function TabButton({ children, isFocused, ...props }: TabTriggerSlotProps) {
  const theme = useTheme();
  return (
    <Pressable
      {...props}
      android_ripple={{ color: theme.backgroundSelected }}
      accessibilityRole="tab"
      accessibilityState={{ selected: isFocused }}
      style={({ pressed }) => pressed && styles.pressed}>
      <View
        style={[
          styles.tabButtonView,
          {
            borderColor: isFocused ? theme.primary : 'transparent',
            // A tinted pill with a primary label, not a solid orange fill with
            // a drop shadow. The old treatment was the loudest thing on an
            // otherwise flat dark page, and its shadowColor '#000' was the one
            // hardcoded colour in this file.
            backgroundColor: isFocused ? theme.backgroundSelected : 'transparent',
          },
        ]}>
        <ThemedText
          type="code"
          style={[styles.tabButtonLabel, isFocused ? { color: theme.primary } : undefined]}
          themeColor={isFocused ? undefined : 'textSecondary'}
          maxFontSizeMultiplier={1.2}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function CustomTabList({ children, ...rest }: TabListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const scrollRef = useRef<ScrollView>(null);
  // Keyed by tab index, populated as each tab button reports its own layout —
  // lets us scroll the active one into view without hardcoding tab widths.
  const tabLayouts = useRef<{ x: number; width: number }[]>([]);

  const activeIndex = TABS.findIndex((tab) =>
    tab.href === '/' ? pathname === '/' : pathname.startsWith(tab.href),
  );

  // Navigating here via a dashboard link (not a tap on the tab bar itself)
  // otherwise leaves the bar scrolled wherever it last was, so the newly
  // active tab can be scrolled off-screen with nothing visually indicating
  // where you are — center it instead of merely scrolling it into view.
  const scrollToTab = (index: number) => {
    const layout = tabLayouts.current[index];
    if (!layout) return;
    scrollRef.current?.scrollTo({ x: Math.max(0, layout.x - Spacing.six), animated: true });
  };

  useEffect(() => {
    scrollToTab(activeIndex);
  }, [activeIndex]);

  const items = Children.toArray(children);

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.tabListContainer, { borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
      <ScrollView
        ref={scrollRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View {...rest} style={styles.tabRow}>
          {items.map((item, i) => (
            <View
              key={i}
              onLayout={(e) => {
                tabLayouts.current[i] = { x: e.nativeEvent.layout.x, width: e.nativeEvent.layout.width };
                // On first mount the active tab's own onLayout can fire after
                // the effect above already ran and no-opped (layout wasn't
                // known yet) — retry here so a deep link straight into a
                // non-Dashboard tab still centers correctly.
                if (i === activeIndex) scrollToTab(i);
              }}>
              {item}
            </View>
          ))}
        </View>
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tabs: { flex: 1 },
  slot: { flex: 1 },
  tabListContainer: {
    borderTopWidth: 1,
    paddingTop: Spacing.two,
  },
  scrollContent: { paddingHorizontal: Spacing.two },
  tabRow: { flexDirection: 'row', gap: Spacing.one },
  pressed: { opacity: 0.7 },
  tabButtonView: {
    borderWidth: 1,
    // Pill, matching the Chip/Button radius in components/ui.tsx.
    borderRadius: 999,
    justifyContent: 'center',
    // Was ~24pt tall against a 44pt minimum.
    minHeight: 44,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  tabButtonLabel: {
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});
