import { DarkTheme, ThemeProvider } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import AppTabs from '@/components/app-tabs';
import { LoginScreen } from '@/components/login-screen';
import { Colors } from '@/constants/theme';
import { usePushRegistration } from '@/hooks/use-push-registration';
import { AuthProvider, useAuth } from '@/lib/auth-context';

// The app no longer follows the OS light/dark setting (see theme.ts) — react
// navigation's own theme shouldn't either, or a light-mode device/browser
// (this app also builds for web, where useColorScheme reads prefers-color-scheme
// directly) would get light nav-level chrome around otherwise-dark screens.
const AppNavigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: Colors.dark.background,
    card: Colors.dark.backgroundElement,
    text: Colors.dark.text,
    border: Colors.dark.border,
    primary: Colors.dark.primary,
  },
};

function Gate() {
  const { user, loading } = useAuth();
  usePushRegistration(user?.uid);
  if (loading) return null;
  return user ? <AppTabs /> : <LoginScreen />;
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <ThemeProvider value={AppNavigationTheme}>
        <AuthProvider>
          <Gate />
        </AuthProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
