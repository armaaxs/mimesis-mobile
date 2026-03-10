import React, { useEffect } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { type Href, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSupabaseAuth } from '@/hooks/use-supabase-auth';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { loading, isAuthenticated } = useSupabaseAuth();
  const router = useRouter();
  const segments = useSegments();

  // Disabled global preload: reader hook now handles model readiness/recovery directly.

  const inAuthRoute = (segments[0] as string | undefined) === 'auth';

  useEffect(() => {
    if (loading) {
      return;
    }

    if (!isAuthenticated && !inAuthRoute) {
      router.replace('/auth' as Href);
      return;
    }

    if (isAuthenticated && inAuthRoute) {
      router.replace('/(tabs)');
    }
  }, [inAuthRoute, isAuthenticated, loading, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DarkTheme}>
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={AppPalette.accent} size="large" />
        </View>
      ) : (
        <Stack>
          <Stack.Screen name="auth" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          <Stack.Screen name="reader" options={{ presentation: 'card', title: 'Reader', headerShown: true }} />
          <Stack.Screen name="search" options={{ presentation: 'card', headerShown: false }} />
          <Stack.Screen name="Settings" options={{ presentation: 'card', headerShown: false }} />
        </Stack>
      )}
      <StatusBar style="auto" />
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    backgroundColor: AppPalette.background,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
