// Dynamic config (instead of app.json) so the Google Services files can be
// supplied by EAS Build via file-type environment variables without being
// committed to git — see GOOGLE_SERVICES_JSON in `eas env:list`. Falls back
// to the local (gitignored) file for local/dev builds.
export default {
  expo: {
    name: 'Life Client',
    slug: 'life-client',
    version: '1.0.0',
    orientation: 'portrait',
    icon: './assets/images/icon.png',
    scheme: 'lifeclient',
    userInterfaceStyle: 'dark',
    ios: {
      icon: './assets/expo.icon',
      bundleIdentifier: 'com.lifeclient.app',
      // || (not ??) so an EAS env var that resolves to "" still falls back
      // to the local file instead of pointing at an empty path.
      googleServicesFile: process.env.GOOGLE_SERVICES_INFO_PLIST || './GoogleService-Info.plist',
    },
    android: {
      package: 'com.lifeclient.app',
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON || './google-services.json',
      adaptiveIcon: {
        backgroundColor: '#FAF1E3',
        foregroundImage: './assets/images/android-icon-foreground.png',
        backgroundImage: './assets/images/android-icon-background.png',
        monochromeImage: './assets/images/android-icon-monochrome.png',
      },
      predictiveBackGestureEnabled: false,
    },
    web: {
      output: 'static',
      favicon: './assets/images/favicon.png',
    },
    plugins: [
      'expo-router',
      [
        'expo-splash-screen',
        {
          backgroundColor: '#141210',
          image: './assets/images/splash-icon.png',
          imageWidth: 76,
        },
      ],
      'expo-web-browser',
      '@react-native-google-signin/google-signin',
      'expo-notifications',
    ],
    experiments: {
      typedRoutes: true,
      reactCompiler: true,
    },
    extra: {
      router: {},
      eas: {
        projectId: '1f2cb130-c7dc-4716-812b-8e0e5c769496',
      },
    },
    owner: 'devadmindappzy',
  },
};
