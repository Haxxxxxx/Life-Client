import { DarkTheme, DefaultTheme, ThemeProvider } from 'expo-router';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppTabs from '@/components/app-tabs';
import { LoginScreen } from '@/components/login-screen';
import { AuthProvider, useAuth } from '@/lib/auth-context';

function Gate() {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? <AppTabs /> : <LoginScreen />;
}

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
