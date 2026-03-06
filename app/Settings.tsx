import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  ScrollView,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Stack, useRouter } from 'expo-router'; // <-- 1. Imported useRouter
import { Ionicons } from '@expo/vector-icons';
import { useSupabaseAuth } from '@/hooks/use-supabase-auth';
import { isSupabaseConfigured } from '@/services/supabaseAuth';
import { pullUserSettingsFromSupabase } from '@/services/syncService';
import {
  getUserSettings,
  overwriteUserSettingsLocal,
  saveUserSettings,
} from '@/utils/userSettingsRepository';

export default function Settings() {
  const router = useRouter(); // <-- 2. Initialized router
  
  // State for toggleable settings
  const [isAmoledDark, setIsAmoledDark] = useState(true);
  const [wifiOnly, setWifiOnly] = useState(false);
  const [authActionLoading, setAuthActionLoading] = useState<'google' | 'apple' | 'logout' | null>(null);

  const { user, loading, isAuthenticated, signInWithApple, signInWithGoogle, signOut } = useSupabaseAuth();

  React.useEffect(() => {
    let mounted = true;

    const hydrateSettings = async () => {
      const localSettings = await getUserSettings();
      if (!mounted) {
        return;
      }

      setIsAmoledDark(localSettings.amoledDark);
      setWifiOnly(localSettings.wifiOnlyDownloads);

      if (isAuthenticated && isSupabaseConfigured) {
        void (async () => {
          const remoteSettings = await pullUserSettingsFromSupabase();
          if (!mounted || !remoteSettings) {
            return;
          }

          setIsAmoledDark(remoteSettings.amoledDark);
          setWifiOnly(remoteSettings.wifiOnlyDownloads);
          await overwriteUserSettingsLocal(remoteSettings);
        })();
      }
    };

    void hydrateSettings();

    return () => {
      mounted = false;
    };
  }, [isAuthenticated]);

  const handleToggleAmoled = async (nextValue: boolean) => {
    setIsAmoledDark(nextValue);

    const current = await getUserSettings();
    await saveUserSettings({
      ...current,
      amoledDark: nextValue,
    });
  };

  const handleToggleWifiOnly = async (nextValue: boolean) => {
    setWifiOnly(nextValue);

    const current = await getUserSettings();
    await saveUserSettings({
      ...current,
      wifiOnlyDownloads: nextValue,
    });
  };

  const handleOAuthSignIn = async (provider: 'google' | 'apple') => {
    if (!isSupabaseConfigured) {
      Alert.alert(
        'Supabase not configured',
        'Set EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your environment before signing in.'
      );
      return;
    }

    try {
      setAuthActionLoading(provider);
      const response = provider === 'google' ? await signInWithGoogle() : await signInWithApple();

      if (response.error) {
        Alert.alert('Sign-in failed', response.error.message);
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected authentication error.';
      Alert.alert('Sign-in failed', message);
    } finally {
      setAuthActionLoading(null);
    }
  };

  const handleLogout = () => {
    if (!isAuthenticated) {
      Alert.alert('Not signed in', 'You are not currently signed in.');
      return;
    }

    Alert.alert('Log Out', 'Are you sure you want to log out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Log Out',
        style: 'destructive',
        onPress: async () => {
          try {
            setAuthActionLoading('logout');
            const response = await signOut();
            if (response.error) {
              Alert.alert('Logout failed', response.error.message);
            }
          } finally {
            setAuthActionLoading(null);
          }
        },
      },
    ]);
  };

  const authStatusLabel = loading ? 'Checking session...' : isAuthenticated ? 'Connected' : 'Not connected';
  const authStatusValue = user?.email ?? 'Sign in to sync your progress';

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false, // <-- 3. Hid the default header so we only see your custom one
        }}
      />
      
      {/* 4. Added the Back Button to your Header Row */}
      <View style={styles.headerRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color="#00bca3" />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        {/* ACCOUNT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.groupBlock}>
            <View style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="person" size={20} color="#00bca3" style={styles.itemIcon} />
                <View>
                  <Text style={styles.itemText}>{authStatusLabel}</Text>
                  <Text style={styles.itemSubtext}>{authStatusValue}</Text>
                </View>
              </View>

              {loading ? (
                <ActivityIndicator color="#00bca3" />
              ) : (
                <View style={styles.statusPill}>
                  <Text style={styles.statusPillText}>{isAuthenticated ? 'SIGNED IN' : 'GUEST'}</Text>
                </View>
              )}
            </View>

            {!isAuthenticated && (
              <>
                <TouchableOpacity
                  style={[styles.itemRow, styles.bottomBorder]}
                  onPress={() => handleOAuthSignIn('google')}
                  disabled={authActionLoading !== null}
                >
                  <View style={styles.itemLeft}>
                    <Ionicons name="logo-google" size={20} color="#00bca3" style={styles.itemIcon} />
                    <Text style={styles.itemText}>Continue with Google</Text>
                  </View>
                  {authActionLoading === 'google' ? (
                    <ActivityIndicator color="#00bca3" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#666666" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.itemRow}
                  onPress={() => handleOAuthSignIn('apple')}
                  disabled={authActionLoading !== null}
                >
                  <View style={styles.itemLeft}>
                    <Ionicons name="logo-apple" size={20} color="#00bca3" style={styles.itemIcon} />
                    <Text style={styles.itemText}>Continue with Apple</Text>
                  </View>
                  {authActionLoading === 'apple' ? (
                    <ActivityIndicator color="#00bca3" />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color="#666666" />
                  )}
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>

        {/* READING EXPERIENCE SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Reading Experience</Text>
          <View style={styles.groupBlock}>
            <TouchableOpacity style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="text" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>Typography & Font Size</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#666666" />
            </TouchableOpacity>

            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Ionicons name="moon" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>True AMOLED Black</Text>
              </View>
              <Switch
                value={isAmoledDark}
                onValueChange={handleToggleAmoled}
                trackColor={{ false: '#333333', true: '#00bca3' }}
                thumbColor={'#ffffff'}
              />
            </View>
          </View>
        </View>

        {/* DATA & STORAGE SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data & Storage</Text>
          <View style={styles.groupBlock}>
            <View style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="wifi" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>Download over Wi-Fi Only</Text>
              </View>
              <Switch
                value={wifiOnly}
                onValueChange={handleToggleWifiOnly}
                trackColor={{ false: '#333333', true: '#00bca3' }}
                thumbColor={'#ffffff'}
              />
            </View>

            <TouchableOpacity style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Ionicons name="trash" size={20} color="#00ffb7" style={styles.itemIcon} />
                <Text style={styles.itemText}>Clear Image Cache</Text>
              </View>
              <Text style={styles.itemValue}>142 MB</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ABOUT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>About</Text>
          <View style={styles.groupBlock}>
            <TouchableOpacity style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="information-circle" size={20} color="#00bca3" style={styles.itemIcon} />
                <Text style={styles.itemText}>App Info</Text>
              </View>
              <Text style={styles.itemValue}>v1.0.0</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.itemRow} onPress={handleLogout}>
              <View style={styles.itemLeft}>
                <Ionicons name="log-out" size={20} color="#666666" style={styles.itemIcon} />
                <Text style={styles.itemText}>{isAuthenticated ? 'Log Out' : 'Log Out (inactive)'}</Text>
              </View>
              {authActionLoading === 'logout' && <ActivityIndicator color="#00bca3" />}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  headerRow: {
    marginTop: 20,
    marginBottom: 20,
    paddingHorizontal: 20, // Slightly reduced to make room for the button
    flexDirection: 'row',
    alignItems: 'center',
  },
  // 5. Added style for the back button
  backButton: {
    marginRight: 12,
    marginLeft: -4, // Optically aligns the chevron with the edge of the screen below
    padding: 4,     // Makes the invisible touch target larger for thumbs
  },
  title: {
    fontSize: 34,
    color: '#ffffff',
    fontFamily: 'Georgia',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 60,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: '#00bca3',
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: 'Georgia',
  },
  groupBlock: {
    backgroundColor: '#111111',
    borderRadius: 16,
    overflow: 'hidden',
  },
  itemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 16,
    paddingHorizontal: 16,
    minHeight: 56,
  },
  bottomBorder: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#222222',
  },
  itemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemIcon: {
    marginRight: 14,
    width: 24,
    textAlign: 'center',
  },
  itemText: {
    color: '#F0F0F0',
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  itemValue: {
    color: '#888888',
    fontSize: 14,
    fontFamily: 'Georgia',
  },
  itemSubtext: {
    marginTop: 2,
    color: '#888888',
    fontSize: 12,
    fontFamily: 'Georgia',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: '#0e2f2a',
  },
  statusPillText: {
    color: '#00bca3',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});