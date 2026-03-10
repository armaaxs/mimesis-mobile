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
import { AppPalette } from '@/constants/theme';

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
          <Ionicons name="chevron-back" size={28} color={AppPalette.accent} />
        </TouchableOpacity>
        <Text style={styles.title}>Settings</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false}>
        <View style={styles.settingsGraphic}>
          <View style={styles.settingsGraphicPanel}>
            <View style={styles.settingsGraphicDial}>
              <Ionicons name="options-outline" size={18} color={AppPalette.surface} />
            </View>
            <View style={styles.settingsGraphicLine} />
            <View style={styles.settingsGraphicLineShort} />
            <View style={styles.settingsGraphicPills}>
              <View style={styles.settingsGraphicPill} />
              <View style={[styles.settingsGraphicPill, styles.settingsGraphicPillAccent]} />
              <View style={styles.settingsGraphicPill} />
            </View>
          </View>
        </View>
        {/* ACCOUNT SECTION */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Account</Text>
          <View style={styles.groupBlock}>
            <View style={[styles.itemRow, styles.bottomBorder]}>
              <View style={styles.itemLeft}>
                <Ionicons name="person" size={20} color={AppPalette.accent} style={styles.itemIcon} />
                <View>
                  <Text style={styles.itemText}>{authStatusLabel}</Text>
                  <Text style={styles.itemSubtext}>{authStatusValue}</Text>
                </View>
              </View>

              {loading ? (
                <ActivityIndicator color={AppPalette.accent} />
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
                    <Ionicons name="logo-google" size={20} color={AppPalette.accent} style={styles.itemIcon} />
                    <Text style={styles.itemText}>Continue with Google</Text>
                  </View>
                  {authActionLoading === 'google' ? (
                    <ActivityIndicator color={AppPalette.accent} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={AppPalette.textSubtle} />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.itemRow}
                  onPress={() => handleOAuthSignIn('apple')}
                  disabled={authActionLoading !== null}
                >
                  <View style={styles.itemLeft}>
                    <Ionicons name="logo-apple" size={20} color={AppPalette.accent} style={styles.itemIcon} />
                    <Text style={styles.itemText}>Continue with Apple</Text>
                  </View>
                  {authActionLoading === 'apple' ? (
                    <ActivityIndicator color={AppPalette.accent} />
                  ) : (
                    <Ionicons name="chevron-forward" size={18} color={AppPalette.textSubtle} />
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
                <Ionicons name="text" size={20} color={AppPalette.accent} style={styles.itemIcon} />
                <Text style={styles.itemText}>Typography & Font Size</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={AppPalette.textSubtle} />
            </TouchableOpacity>

            <View style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Ionicons name="moon" size={20} color={AppPalette.accent} style={styles.itemIcon} />
                <Text style={styles.itemText}>True AMOLED Black</Text>
              </View>
              <Switch
                value={isAmoledDark}
                onValueChange={handleToggleAmoled}
                trackColor={{ false: AppPalette.border, true: AppPalette.accent }}
                thumbColor={AppPalette.surface}
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
                <Ionicons name="wifi" size={20} color={AppPalette.accent} style={styles.itemIcon} />
                <Text style={styles.itemText}>Download over Wi-Fi Only</Text>
              </View>
              <Switch
                value={wifiOnly}
                onValueChange={handleToggleWifiOnly}
                trackColor={{ false: AppPalette.border, true: AppPalette.accent }}
                thumbColor={AppPalette.surface}
              />
            </View>

            <TouchableOpacity style={styles.itemRow}>
              <View style={styles.itemLeft}>
                <Ionicons name="trash" size={20} color={AppPalette.danger} style={styles.itemIcon} />
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
                <Ionicons name="information-circle" size={20} color={AppPalette.accent} style={styles.itemIcon} />
                <Text style={styles.itemText}>App Info</Text>
              </View>
              <Text style={styles.itemValue}>v1.0.0</Text>
            </TouchableOpacity>
            
            <TouchableOpacity style={styles.itemRow} onPress={handleLogout}>
              <View style={styles.itemLeft}>
                <Ionicons name="log-out" size={20} color={AppPalette.textSubtle} style={styles.itemIcon} />
                <Text style={styles.itemText}>{isAuthenticated ? 'Log Out' : 'Log Out (inactive)'}</Text>
              </View>
              {authActionLoading === 'logout' && <ActivityIndicator color={AppPalette.accent} />}
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
    backgroundColor: AppPalette.background,
  },
  headerRow: {
    marginTop: 12,
    marginBottom: 20,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    marginRight: 12,
    marginLeft: -4,
    padding: 8,
    borderRadius: 14,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
  },
  title: {
    fontSize: 34,
    color: AppPalette.text,
    fontFamily: 'Georgia',
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingBottom: 60,
  },
  settingsGraphic: {
    marginBottom: 28,
  },
  settingsGraphicPanel: {
    backgroundColor: AppPalette.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    padding: 18,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  settingsGraphicDial: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  settingsGraphicLine: {
    width: '58%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(36, 28, 24, 0.08)',
    marginBottom: 10,
  },
  settingsGraphicLineShort: {
    width: '34%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(47, 107, 98, 0.14)',
    marginBottom: 18,
  },
  settingsGraphicPills: {
    flexDirection: 'row',
    gap: 10,
  },
  settingsGraphicPill: {
    width: 48,
    height: 32,
    borderRadius: 999,
    backgroundColor: AppPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.18)',
  },
  settingsGraphicPillAccent: {
    backgroundColor: AppPalette.accentSoft,
  },
  section: {
    marginBottom: 28,
  },
  sectionTitle: {
    color: AppPalette.accent,
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 8,
    marginLeft: 16,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    fontFamily: 'Georgia',
  },
  groupBlock: {
    backgroundColor: AppPalette.surface,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 3,
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
    borderBottomColor: AppPalette.border,
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
    color: AppPalette.text,
    fontSize: 16,
    fontFamily: 'Georgia',
    fontWeight: '500',
  },
  itemValue: {
    color: AppPalette.textSubtle,
    fontSize: 14,
    fontFamily: 'Georgia',
  },
  itemSubtext: {
    marginTop: 2,
    color: AppPalette.textSubtle,
    fontSize: 12,
    fontFamily: 'Georgia',
  },
  statusPill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 999,
    backgroundColor: AppPalette.accentSoft,
  },
  statusPillText: {
    color: AppPalette.accentStrong,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});
