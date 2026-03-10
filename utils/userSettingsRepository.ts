import AsyncStorage from '@react-native-async-storage/async-storage';

import { enqueueUserSettingsSync } from '@/services/syncService';
import { DEFAULT_GUTENDEX_CATEGORY_IDS, sanitizeGutendexCategoryIds } from '@/utils/gutendex';

const SETTINGS_KEY = 'mimesis.user.settings.v1';

export type UserSettings = {
  amoledDark: boolean;
  wifiOnlyDownloads: boolean;
  fontScale: number;
  profileName: string;
  birthdate: string;
  favoriteCategoryIds: string[];
  onboardingCompletedAt: string | null;
};

export const DEFAULT_USER_SETTINGS: UserSettings = {
  amoledDark: true,
  wifiOnlyDownloads: false,
  fontScale: 1,
  profileName: '',
  birthdate: '',
  favoriteCategoryIds: DEFAULT_GUTENDEX_CATEGORY_IDS.slice(0, 3),
  onboardingCompletedAt: null,
};

export const getUserSettings = async (): Promise<UserSettings> => {
  const raw = await AsyncStorage.getItem(SETTINGS_KEY);
  if (!raw) {
    return DEFAULT_USER_SETTINGS;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<UserSettings>;

    return {
      amoledDark:
        typeof parsed.amoledDark === 'boolean' ? parsed.amoledDark : DEFAULT_USER_SETTINGS.amoledDark,
      wifiOnlyDownloads:
        typeof parsed.wifiOnlyDownloads === 'boolean'
          ? parsed.wifiOnlyDownloads
          : DEFAULT_USER_SETTINGS.wifiOnlyDownloads,
      fontScale:
        typeof parsed.fontScale === 'number' && Number.isFinite(parsed.fontScale)
          ? parsed.fontScale
          : DEFAULT_USER_SETTINGS.fontScale,
      profileName:
        typeof parsed.profileName === 'string' ? parsed.profileName : DEFAULT_USER_SETTINGS.profileName,
      birthdate:
        typeof parsed.birthdate === 'string' ? parsed.birthdate : DEFAULT_USER_SETTINGS.birthdate,
      favoriteCategoryIds: sanitizeGutendexCategoryIds(
        parsed.favoriteCategoryIds,
        DEFAULT_USER_SETTINGS.favoriteCategoryIds,
      ),
      onboardingCompletedAt:
        typeof parsed.onboardingCompletedAt === 'string' ? parsed.onboardingCompletedAt : null,
    };
  } catch {
    return DEFAULT_USER_SETTINGS;
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
