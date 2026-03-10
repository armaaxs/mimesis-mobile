import React, { useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { DarkTheme, ThemeProvider } from '@react-navigation/native';
import { type Href, Stack, useRouter, useSegments } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import 'react-native-reanimated';

import { AppPalette } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useSupabaseAuth } from '@/hooks/use-supabase-auth';
import { getOnboardingState } from '@/utils/onboardingRepository';

export const unstable_settings = {
  anchor: '(tabs)',
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const { loading, isAuthenticated } = useSupabaseAuth();
  const router = useRouter();
  const segments = useSegments();
  const [onboardingLoading, setOnboardingLoading] = React.useState(true);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = React.useState(false);
  const redirectTargetRef = useRef<Href | null>(null);
  const routeGroup = segments[0] as string | undefined;
  const inAuthRoute = routeGroup === 'auth';
  const inOnboardingRoute = routeGroup === 'onboarding';

  useEffect(() => {
    let active = true;
    setOnboardingLoading(true);

    const hydrateOnboarding = async () => {
      const onboardingState = await getOnboardingState();
      if (!active) {
        return;
      }

      setHasCompletedOnboarding((previous) =>
        previous === onboardingState.completed ? previous : onboardingState.completed,
      );
      setOnboardingLoading(false);
    };

    void hydrateOnboarding();

    return () => {
      active = false;
    };
  }, [routeGroup]);

  const redirectTarget = useMemo<Href | null>(() => {
    if (loading || onboardingLoading) {
      return null;
    }

    if (isAuthenticated) {
      if (inAuthRoute || inOnboardingRoute || routeGroup === undefined) {
        return '/(tabs)';
      }

      return null;
    }

    if (!hasCompletedOnboarding) {
      return inOnboardingRoute ? null : '/onboarding';
    }

    return inAuthRoute ? null : '/auth';
  }, [hasCompletedOnboarding, inAuthRoute, inOnboardingRoute, isAuthenticated, loading, onboardingLoading, routeGroup]);

  useEffect(() => {
    if (!redirectTarget) {
      redirectTargetRef.current = null;
      return;
    }

    if (redirectTargetRef.current === redirectTarget) {
      return;
    }

    redirectTargetRef.current = redirectTarget;
    router.replace(redirectTarget);
  }, [redirectTarget, router]);

  return (
    <ThemeProvider value={colorScheme === 'dark' ? DarkTheme : DarkTheme}>
      {loading || onboardingLoading || redirectTarget ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator color={AppPalette.accent} size="large" />
        </View>
      ) : (
        <Stack>
          <Stack.Screen name="onboarding" options={{ headerShown: false }} />
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
