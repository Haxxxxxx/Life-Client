import { Tabs, TabList, TabTrigger, TabSlot, TabTriggerSlotProps, TabListProps } from 'expo-router/ui';
import { Pressable, ScrollView, View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from './themed-text';
import { ThemedView } from './themed-view';

import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

const TABS = [
  { name: 'index', href: '/', label: 'Dashboard' },
  { name: 'tasks', href: '/tasks', label: 'Tasks' },
  { name: 'sports', href: '/sports', label: 'Sports' },
  { name: 'integrations', href: '/integrations', label: 'Integrations' },
  { name: 'remember', href: '/remember', label: 'Remember' },
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
    <Pressable {...props} style={({ pressed }) => pressed && styles.pressed}>
      <View
        style={[
          styles.tabButtonView,
          {
            borderColor: theme.border,
            backgroundColor: isFocused ? theme.primary : 'transparent',
          },
        ]}>
        <ThemedText
          type="smallBold"
          style={isFocused ? { color: theme.primaryForeground } : undefined}
          themeColor={isFocused ? undefined : 'textSecondary'}>
          {children}
        </ThemedText>
      </View>
    </Pressable>
  );
}

export function CustomTabList(props: TabListProps) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  return (
    <ThemedView
      type="backgroundElement"
      style={[styles.tabListContainer, { borderTopColor: theme.border, paddingBottom: insets.bottom + Spacing.two }]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}>
        <View {...props} style={styles.tabRow} />
      </ScrollView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  tabs: { flex: 1 },
  slot: { flex: 1 },
  tabListContainer: {
    borderTopWidth: 2,
    paddingTop: Spacing.two,
  },
  scrollContent: { paddingHorizontal: Spacing.three },
  tabRow: { flexDirection: 'row', gap: Spacing.one },
  pressed: { opacity: 0.7 },
  tabButtonView: {
    borderWidth: 2,
    borderRadius: 999,
    paddingVertical: Spacing.one,
    paddingHorizontal: Spacing.three,
  },
});
