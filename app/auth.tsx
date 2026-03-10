import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

import { AppPalette } from '@/constants/theme';
import { useSupabaseAuth } from '@/hooks/use-supabase-auth';
import { isSupabaseConfigured } from '@/services/supabaseAuth';

export default function AuthScreen() {
  const [actionLoading, setActionLoading] = useState<'google' | 'apple' | null>(null);
  const { signInWithApple, signInWithGoogle } = useSupabaseAuth();

  const handleSignIn = async (provider: 'google' | 'apple') => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase not configured',
        'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment.'
      );
      return;
    }

    try {
      setActionLoading(provider);
      const response = provider === 'google' ? await signInWithGoogle() : await signInWithApple();
      if (response.error) {
        Alert.alert('Sign-in failed', response.error.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected authentication error.';
      Alert.alert('Sign-in failed', message);
    } finally {
      setActionLoading(null);
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.content}>
        <View style={styles.eyebrowWrap}>
          <Text style={styles.eyebrow}>Your reading room</Text>
        </View>
        <Text style={styles.title}>Welcome to Mimesis-82</Text>
        <Text style={styles.subtitle}>Sign in to access your library and synced reading progress.</Text>
        <View style={styles.authGraphic}>
          <View style={[styles.authBook, styles.authBookLeft]} />
          <View style={[styles.authBook, styles.authBookCenter]} />
          <View style={[styles.authBook, styles.authBookRight]} />
          <View style={styles.authSeal}>
            <Ionicons name="moon-outline" size={18} color={AppPalette.surface} />
          </View>
        </View>

        <TouchableOpacity
          style={[styles.authButton, styles.buttonDivider]}
          onPress={() => handleSignIn('google')}
          disabled={actionLoading !== null}
        >
          <View style={styles.buttonLeft}>
            <Ionicons name="logo-google" size={20} color={AppPalette.accent} style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Continue with Google</Text>
          </View>
          {actionLoading === 'google' ? <ActivityIndicator color={AppPalette.accent} /> : <Ionicons name="chevron-forward" size={18} color={AppPalette.textSubtle} />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.authButton}
          onPress={() => handleSignIn('apple')}
          disabled={actionLoading !== null}
        >
          <View style={styles.buttonLeft}>
            <Ionicons name="logo-apple" size={20} color={AppPalette.accent} style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Continue with Apple</Text>
          </View>
          {actionLoading === 'apple' ? <ActivityIndicator color={AppPalette.accent} /> : <Ionicons name="chevron-forward" size={18} color={AppPalette.textSubtle} />}
        </TouchableOpacity>
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
    justifyContent: 'center',
  },
  eyebrowWrap: {
    alignSelf: 'flex-start',
    backgroundColor: AppPalette.accentSoft,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    marginBottom: 20,
  },
  eyebrow: {
    color: AppPalette.accentStrong,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  title: {
    color: AppPalette.text,
    fontSize: 32,
    fontFamily: 'Georgia',
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: AppPalette.textMuted,
    fontSize: 15,
    fontFamily: 'Georgia',
    marginBottom: 32,
    lineHeight: 23,
  },
  authGraphic: {
    height: 136,
    borderRadius: 28,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    marginBottom: 24,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  authBook: {
    position: 'absolute',
    bottom: 20,
    width: 42,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
  },
  authBookLeft: {
    left: 28,
    height: 64,
    backgroundColor: AppPalette.backgroundMuted,
  },
  authBookCenter: {
    left: 78,
    height: 82,
    backgroundColor: AppPalette.accentSoft,
  },
  authBookRight: {
    left: 128,
    height: 56,
    backgroundColor: AppPalette.background,
  },
  authSeal: {
    position: 'absolute',
    right: 22,
    top: 20,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: AppPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  authButton: {
    backgroundColor: AppPalette.surface,
    borderRadius: 18,
    minHeight: 64,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.12,
    shadowRadius: 18,
    elevation: 3,
  },
  buttonDivider: {
    marginBottom: 12,
  },
  buttonLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  buttonIcon: {
    marginRight: 12,
  },
  buttonText: {
    color: AppPalette.text,
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
});
