import React, { useState } from 'react';
import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';

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
        <Text style={styles.title}>Welcome to Mimesis-82</Text>
        <Text style={styles.subtitle}>Sign in to access your library and synced reading progress.</Text>

        <TouchableOpacity
          style={[styles.authButton, styles.buttonDivider]}
          onPress={() => handleSignIn('google')}
          disabled={actionLoading !== null}
        >
          <View style={styles.buttonLeft}>
            <Ionicons name="logo-google" size={20} color="#00bca3" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Continue with Google</Text>
          </View>
          {actionLoading === 'google' ? <ActivityIndicator color="#00bca3" /> : <Ionicons name="chevron-forward" size={18} color="#666666" />}
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.authButton}
          onPress={() => handleSignIn('apple')}
          disabled={actionLoading !== null}
        >
          <View style={styles.buttonLeft}>
            <Ionicons name="logo-apple" size={20} color="#00bca3" style={styles.buttonIcon} />
            <Text style={styles.buttonText}>Continue with Apple</Text>
          </View>
          {actionLoading === 'apple' ? <ActivityIndicator color="#00bca3" /> : <Ionicons name="chevron-forward" size={18} color="#666666" />}
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    justifyContent: 'center',
  },
  title: {
    color: '#ffffff',
    fontSize: 32,
    fontFamily: 'Georgia',
    fontWeight: '700',
    marginBottom: 12,
  },
  subtitle: {
    color: '#B5B5B5',
    fontSize: 15,
    fontFamily: 'Georgia',
    marginBottom: 28,
  },
  authButton: {
    backgroundColor: '#111111',
    borderRadius: 14,
    minHeight: 58,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
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
    color: '#F0F0F0',
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
});
