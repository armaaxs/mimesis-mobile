import AsyncStorage from '@react-native-async-storage/async-storage';

import { DEFAULT_GUTENDEX_CATEGORY_IDS, sanitizeGutendexCategoryIds } from '@/utils/gutendex';

const ONBOARDING_STATE_KEY = 'mimesis.onboarding.state.v2';
const LAST_STEP_INDEX = 6;

export type OnboardingState = {
  completed: boolean;
  currentStep: number;
  name: string;
  birthdate: string;
  favoriteCategoryIds: string[];
  updatedAt: number;
};

export const DEFAULT_ONBOARDING_STATE: OnboardingState = {
  completed: false,
  currentStep: 0,
  name: '',
  birthdate: '',
  favoriteCategoryIds: DEFAULT_GUTENDEX_CATEGORY_IDS.slice(0, 3),
  updatedAt: 0,
};

const clampStep = (value: unknown) => {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return DEFAULT_ONBOARDING_STATE.currentStep;
  }

  return Math.min(LAST_STEP_INDEX, Math.max(0, Math.floor(value)));
};

export const getOnboardingState = async (): Promise<OnboardingState> => {
  const raw = await AsyncStorage.getItem(ONBOARDING_STATE_KEY);
  if (!raw) {
    return DEFAULT_ONBOARDING_STATE;
  }

  try {
    const parsed = JSON.parse(raw) as Partial<OnboardingState>;

    return {
      completed: Boolean(parsed.completed),
      currentStep: clampStep(parsed.currentStep),
      name: typeof parsed.name === 'string' ? parsed.name : DEFAULT_ONBOARDING_STATE.name,
      birthdate: typeof parsed.birthdate === 'string' ? parsed.birthdate : DEFAULT_ONBOARDING_STATE.birthdate,
      favoriteCategoryIds: sanitizeGutendexCategoryIds(parsed.favoriteCategoryIds),
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    };
  } catch {
    return DEFAULT_ONBOARDING_STATE;
  }
};

export const saveOnboardingState = async (
  patch: Partial<Omit<OnboardingState, 'updatedAt'>>,
): Promise<OnboardingState> => {
  const current = await getOnboardingState();
  const nextState: OnboardingState = {
    completed: typeof patch.completed === 'boolean' ? patch.completed : current.completed,
    currentStep: patch.currentStep === undefined ? current.currentStep : clampStep(patch.currentStep),
    name: typeof patch.name === 'string' ? patch.name : current.name,
    birthdate: typeof patch.birthdate === 'string' ? patch.birthdate : current.birthdate,
    favoriteCategoryIds:
      patch.favoriteCategoryIds === undefined
        ? current.favoriteCategoryIds
        : sanitizeGutendexCategoryIds(patch.favoriteCategoryIds),
    updatedAt: Date.now(),
  };

  await AsyncStorage.setItem(ONBOARDING_STATE_KEY, JSON.stringify(nextState));
  return nextState;
};

export const completeOnboarding = async (payload: {
  name: string;
  birthdate: string;
  favoriteCategoryIds: string[];
}): Promise<OnboardingState> => {
  return saveOnboardingState({
    completed: true,
    currentStep: LAST_STEP_INDEX,
    name: payload.name.trim(),
    birthdate: payload.birthdate.trim(),
    favoriteCategoryIds: payload.favoriteCategoryIds,
  });
};

export const clearOnboardingState = async (): Promise<void> => {
  await AsyncStorage.removeItem(ONBOARDING_STATE_KEY);
};
