import { NativeTabs } from 'expo-router/unstable-native-tabs';
import { useColorScheme } from 'react-native';

import { Colors } from '@/constants/theme';

export default function AppTabs() {
  const scheme = useColorScheme();
  const colors = Colors[scheme === 'unspecified' ? 'light' : scheme];

  return (
    <NativeTabs
      backgroundColor={colors.background}
      indicatorColor={colors.backgroundElement}
      tintColor={colors.primary}
      labelStyle={{ selected: { color: colors.primary } }}>
      <NativeTabs.Trigger name="index">
        <NativeTabs.Trigger.Label>Dashboard</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="house" md="home" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="tasks">
        <NativeTabs.Trigger.Label>Tasks</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="checklist" md="checklist" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="sports">
        <NativeTabs.Trigger.Label>Sports</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="figure.run" md="directions_run" />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="integrations">
        <NativeTabs.Trigger.Label>Integrations</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="link" md="link" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
