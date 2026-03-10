import React, { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppPalette } from '@/constants/theme';
import { useSupabaseAuth } from '@/hooks/use-supabase-auth';
import { isSupabaseConfigured } from '@/services/supabaseAuth';
import { flushSyncQueue } from '@/services/syncService';
import { resolveGutendexCategories } from '@/utils/gutendex';
import { clearOnboardingState, getOnboardingState } from '@/utils/onboardingRepository';
import { getUserSettings, saveUserSettings } from '@/utils/userSettingsRepository';

const formatBirthdateLabel = (birthdate: string) => {
  if (!birthdate) {
    return 'Saved privately on this device';
  }

  const parsed = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return birthdate;
  }

  return parsed.toLocaleDateString(undefined, {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
};

export default function AuthScreen() {
  const [actionLoading, setActionLoading] = useState<'google' | null>(null);
  const [profileName, setProfileName] = useState('');
  const [birthdate, setBirthdate] = useState('');
  const [favoriteLabels, setFavoriteLabels] = useState<string[]>([]);
  const activeRef = useRef(true);
  const { signInWithGoogle } = useSupabaseAuth();

  useEffect(() => {
    activeRef.current = true;

    let active = true;
    const hydrateProfile = async () => {
      const onboardingState = await getOnboardingState();
      if (!active) {
        return;
      }

      setProfileName(onboardingState.name.trim());
      setBirthdate(onboardingState.birthdate.trim());
      setFavoriteLabels(
        resolveGutendexCategories(onboardingState.favoriteCategoryIds).map((category) => category.title),
      );
    };

    void hydrateProfile();

    return () => {
      active = false;
      activeRef.current = false;
    };
  }, []);

  const handleGoogleSignIn = async () => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase not configured',
        'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.',
      );
      return;
    }

    try {
      setActionLoading('google');
      const response = await signInWithGoogle();
      if (response.error) {
        Alert.alert('Sign-in failed', response.error.message);
        return;
      }

      const [onboardingState, currentSettings] = await Promise.all([
        getOnboardingState(),
        getUserSettings(),
      ]);

      await saveUserSettings({
        ...currentSettings,
        profileName: onboardingState.name.trim(),
        birthdate: onboardingState.birthdate.trim(),
        favoriteCategoryIds: onboardingState.favoriteCategoryIds,
        onboardingCompletedAt: currentSettings.onboardingCompletedAt ?? new Date().toISOString(),
      });

      await flushSyncQueue();
      await clearOnboardingState();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected authentication error.';
      Alert.alert('Sign-in failed', message);
    } finally {
      if (activeRef.current) {
        setActionLoading(null);
      }
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.stepPill}>
          <Text style={styles.stepPillText}>Step 7 of 7</Text>
        </View>

        <Text style={styles.title}>Finish your reading room</Text>
        <Text style={styles.subtitle}>
          Sign in with Google to save your profile, personalize Explore, and sync your library and progress.
        </Text>

        <View style={styles.summaryCard}>
          <View style={styles.summaryRow}>
            <View style={styles.summaryBadge}>
              <Ionicons name="sparkles-outline" size={18} color={AppPalette.surface} />
            </View>
            <View style={styles.summaryCopy}>
              <Text style={styles.summaryEyebrow}>Ready to unlock</Text>
              <Text style={styles.summaryTitle}>
                {profileName ? `${profileName}, your first shelves are warm.` : 'Your first shelves are warm.'}
              </Text>
            </View>
          </View>

          <View style={styles.summaryStats}>
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Public-domain catalog</Text>
              <Text style={styles.statValue}>75,000+</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statBlock}>
              <Text style={styles.statLabel}>Saved preferences</Text>
              <Text style={styles.statValue}>{favoriteLabels.length || 3}</Text>
            </View>
          </View>

          <View style={styles.identityPanel}>
            <View style={styles.identityRow}>
              <Text style={styles.identityLabel}>Name</Text>
              <Text style={styles.identityValue}>{profileName || 'Reader profile ready'}</Text>
            </View>
            <View style={styles.identityRow}>
              <Text style={styles.identityLabel}>Birthdate</Text>
              <Text style={styles.identityValue}>{formatBirthdateLabel(birthdate)}</Text>
            </View>
          </View>

          <View style={styles.chipWrap}>
            {favoriteLabels.slice(0, 5).map((label) => (
              <View key={label} style={styles.categoryChip}>
                <Text style={styles.categoryChipText}>{label}</Text>
              </View>
            ))}
          </View>
        </View>

        <TouchableOpacity
          style={styles.googleButton}
          onPress={handleGoogleSignIn}
          disabled={actionLoading !== null}
          activeOpacity={0.9}
        >
          <View style={styles.googleButtonLeft}>
            <Ionicons name="logo-google" size={20} color={AppPalette.accent} style={styles.googleIcon} />
            <Text style={styles.googleButtonText}>Continue with Google</Text>
          </View>
          {actionLoading === 'google' ? (
            <ActivityIndicator color={AppPalette.accent} />
          ) : (
            <Ionicons name="chevron-forward" size={18} color={AppPalette.textSubtle} />
          )}
        </TouchableOpacity>

        <Text style={styles.footerNote}>
          Your categories, age preferences, and reading setup are saved locally first, then synced to your account after sign-in.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppPalette.background,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 18,
    paddingBottom: 28,
    justifyContent: 'space-between',
  },
  stepPill: {
    alignSelf: 'flex-start',
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: AppPalette.accentSoft,
  },
  stepPillText: {
    color: AppPalette.accentStrong,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.9,
    textTransform: 'uppercase',
  },
  title: {
    marginTop: 18,
    color: AppPalette.text,
    fontSize: 34,
    lineHeight: 38,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  subtitle: {
    marginTop: 12,
    color: AppPalette.textMuted,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Georgia',
  },
  summaryCard: {
    marginTop: 24,
    borderRadius: 28,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    padding: 22,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 3,
  },
  summaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryBadge: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  summaryCopy: {
    flex: 1,
  },
  summaryEyebrow: {
    color: AppPalette.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  summaryTitle: {
    marginTop: 4,
    color: AppPalette.text,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  summaryStats: {
    marginTop: 20,
    paddingVertical: 16,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.26)',
    flexDirection: 'row',
    alignItems: 'center',
  },
  statBlock: {
    flex: 1,
  },
  statLabel: {
    color: AppPalette.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  statValue: {
    marginTop: 6,
    color: AppPalette.text,
    fontSize: 28,
    lineHeight: 30,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  statDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: 'rgba(180, 157, 123, 0.26)',
    marginHorizontal: 14,
  },
  identityPanel: {
    marginTop: 18,
  },
  identityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  identityLabel: {
    color: AppPalette.textSubtle,
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  identityValue: {
    flex: 1,
    marginLeft: 12,
    textAlign: 'right',
    color: AppPalette.text,
    fontSize: 15,
    lineHeight: 21,
    fontFamily: 'Georgia',
    fontWeight: '600',
  },
  chipWrap: {
    marginTop: 16,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  categoryChip: {
    marginRight: 8,
    marginBottom: 8,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: AppPalette.accentSoft,
  },
  categoryChipText: {
    color: AppPalette.accentStrong,
    fontSize: 12,
    fontWeight: '700',
  },
  googleButton: {
    marginTop: 24,
    minHeight: 66,
    borderRadius: 20,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    paddingHorizontal: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 3,
  },
  googleButtonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  googleIcon: {
    marginRight: 12,
  },
  googleButtonText: {
    color: AppPalette.text,
    fontSize: 17,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  footerNote: {
    marginTop: 18,
    color: AppPalette.textSubtle,
    fontSize: 13,
    lineHeight: 19,
    textAlign: 'center',
    fontFamily: 'Georgia',
  },
});
