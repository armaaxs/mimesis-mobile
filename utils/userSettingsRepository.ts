import AsyncStorage from '@react-native-async-storage/async-storage';

import { enqueueUserSettingsSync } from '@/services/syncService';

const SETTINGS_KEY = 'mimesis.user.settings.v1';

export type UserSettings = {
  amoledDark: boolean;
  wifiOnlyDownloads: boolean;
  fontScale: number;
};

const DEFAULT_SETTINGS: UserSettings = {
  amoledDark: true,
  wifiOnlyDownloads: false,
  fontScale: 1,
};

export const getUserSettings = async (): Promise<UserSettings> => {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserSettings>;

    return {
      amoledDark:
        typeof parsed.amoledDark === 'boolean' ? parsed.amoledDark : DEFAULT_SETTINGS.amoledDark,
      wifiOnlyDownloads:
        typeof parsed.wifiOnlyDownloads === 'boolean'
          ? parsed.wifiOnlyDownloads
          : DEFAULT_SETTINGS.wifiOnlyDownloads,
      fontScale:
        typeof parsed.fontScale === 'number' && Number.isFinite(parsed.fontScale)
          ? parsed.fontScale
          : DEFAULT_SETTINGS.fontScale,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveUserSettings = async (next: UserSettings): Promise<void> => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));

  try {
    await enqueueUserSettingsSync(next);
  } catch (error) {
    console.warn('Failed to enqueue user settings sync operation:', error);
  }
};

export const overwriteUserSettingsLocal = async (next: UserSettings): Promise<void> => {
  await AsyncStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
};
