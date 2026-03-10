import { Ionicons } from '@expo/vector-icons';
import { Stack, useRouter } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Easing,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppPalette } from '@/constants/theme';
import {
  DEFAULT_GUTENDEX_CATEGORY_IDS,
  GUTENDEX_CATEGORIES,
  fetchGutendexCatalogSummary,
  prefetchGutendexCategories,
  resolveGutendexCategories,
} from '@/utils/gutendex';
import {
  DEFAULT_ONBOARDING_STATE,
  completeOnboarding,
  getOnboardingState,
  saveOnboardingState,
} from '@/utils/onboardingRepository';

const TOTAL_STEPS = 6;
const MIN_CATEGORY_SELECTION = 3;
const MAX_CATEGORY_SELECTION = 5;

const formatBirthdateInput = (value: string) => {
  const digits = value.replace(/\D/g, '').slice(0, 8);

  if (digits.length <= 4) {
    return digits;
  }

  if (digits.length <= 6) {
    return `${digits.slice(0, 4)}-${digits.slice(4)}`;
  }

  return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)}`;
};

const isValidBirthdate = (birthdate: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(birthdate)) {
    return false;
  }

  const parsed = new Date(`${birthdate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return false;
  }

  return parsed <= new Date();
};

const formatCatalogCount = (count: number | null) => {
  const value = count && count > 0 ? count : 75000;
  return `${Intl.NumberFormat().format(value)}+`;
};

export default function OnboardingScreen() {
  const router = useRouter();
  const { height } = useWindowDimensions();
  const isCompact = height < 820;
  const [step, setStep] = useState(DEFAULT_ONBOARDING_STATE.currentStep);
  const [name, setName] = useState(DEFAULT_ONBOARDING_STATE.name);
  const [birthdate, setBirthdate] = useState(DEFAULT_ONBOARDING_STATE.birthdate);
  const [favoriteCategoryIds, setFavoriteCategoryIds] = useState<string[]>(
    DEFAULT_ONBOARDING_STATE.favoriteCategoryIds,
  );
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const pageAnim = useRef(new Animated.Value(1)).current;

  const selectedCategories = useMemo(
    () => resolveGutendexCategories(favoriteCategoryIds),
    [favoriteCategoryIds],
  );

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      const savedState = await getOnboardingState();
      if (!active) {
        return;
      }

      setStep(savedState.completed ? 0 : savedState.currentStep);
      setName(savedState.name);
      setBirthdate(savedState.birthdate);
      setFavoriteCategoryIds(savedState.favoriteCategoryIds);
      setIsBootstrapping(false);
    };

    void bootstrap();

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    Animated.timing(pageAnim, {
      toValue: 0,
      duration: 0,
      useNativeDriver: true,
    }).start(() => {
      Animated.timing(pageAnim, {
        toValue: 1,
        duration: 260,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }).start();
    });
  }, [pageAnim, step]);

  useEffect(() => {
    let cancelled = false;

    const warmDefaultShelves = async () => {
      try {
        const [summary] = await Promise.all([
          fetchGutendexCatalogSummary(),
          prefetchGutendexCategories(DEFAULT_GUTENDEX_CATEGORY_IDS),
        ]);

        if (cancelled) {
          return;
        }

        setCatalogCount(summary.count);
      } catch {
        if (!cancelled) {
          setCatalogCount(null);
        }
      }
    };

    void warmDefaultShelves();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (isBootstrapping || isSubmitting) {
      return;
    }

    const timer = setTimeout(() => {
      void saveOnboardingState({
        completed: false,
        currentStep: step,
        name,
        birthdate,
        favoriteCategoryIds,
      });
    }, 150);

    return () => {
      clearTimeout(timer);
    };
  }, [birthdate, favoriteCategoryIds, isBootstrapping, isSubmitting, name, step]);

  useEffect(() => {
    if (isBootstrapping || favoriteCategoryIds.length === 0) {
      return;
    }

    let cancelled = false;

    const warmSelectedShelves = async () => {
      try {
        await prefetchGutendexCategories(favoriteCategoryIds);
      } catch {
        if (!cancelled) {
          return;
        }
      }
    };

    void warmSelectedShelves();

    return () => {
      cancelled = true;
    };
  }, [favoriteCategoryIds, isBootstrapping]);

  const handleBack = () => {
    if (step === 0 || isSubmitting) {
      return;
    }

    setStep((previous) => Math.max(previous - 1, 0));
  };

  const handleNext = async () => {
    if (step === TOTAL_STEPS - 1) {
      if (name.trim().length < 2) {
        Alert.alert('Add your name', 'We use your name to personalize the app and greet you properly.');
        return;
      }

      if (!isValidBirthdate(birthdate)) {
        Alert.alert('Check your birthdate', 'Use the YYYY-MM-DD format so your reading room is set up correctly.');
        return;
      }
    }

    if (step === TOTAL_STEPS - 1) {
      try {
        setIsSubmitting(true);
        await completeOnboarding({
          name,
          birthdate,
          favoriteCategoryIds,
        });
        router.replace('/auth');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Unable to finish onboarding right now.';
        Alert.alert('Onboarding failed', message);
        setIsSubmitting(false);
      }

      return;
    }

    if (step === 1 && favoriteCategoryIds.length < MIN_CATEGORY_SELECTION) {
      Alert.alert(
        'Pick a few favorites',
        `Choose at least ${MIN_CATEGORY_SELECTION} categories so Explore feels personal right away.`,
      );
      return;
    }

    setStep((previous) => Math.min(previous + 1, TOTAL_STEPS - 1));
  };

  const toggleCategory = (categoryId: string) => {
    setFavoriteCategoryIds((previous) => {
      if (previous.includes(categoryId)) {
        return previous.filter((id) => id !== categoryId);
      }

      if (previous.length >= MAX_CATEGORY_SELECTION) {
        return [...previous.slice(1), categoryId];
      }

      return [...previous, categoryId];
    });
  };

  const renderInfoStep = (pageIndex: number) => {
    const pages = [
      {
        eyebrow: 'Welcome to Mimesis-82',
        title: 'Your library, reader, and listening space in one place.',
        body:
          'Save books, open them in a clean reader, and switch into narrated playback when you want the story to keep moving with you.',
        stats: [
          { label: 'Public-domain titles', value: formatCatalogCount(catalogCount) },
          { label: 'Downloads to device', value: 'Included' },
          { label: 'Personal library', value: 'Built in' },
        ],
        highlights: [
          'Bring in your own books or discover new ones',
          'Keep your saved titles organized in one shelf',
          'Pick up again without hunting for your place',
        ],
      },
      {
        eyebrow: 'Keep your shelf close',
        title: 'Build a library that feels like your own.',
        body:
          'The app keeps your saved books, your place, and the reading setup that makes long sessions feel easy to return to.',
        stats: [
          { label: 'Saved books', value: 'Ready' },
          { label: 'Resume reading', value: 'Automatic' },
          { label: 'Book storage', value: 'On device' },
        ],
        highlights: [
          'Save books you want to keep close',
          'Return to the same chapter without friction',
          'Let your reading room feel settled over time',
        ],
      },
      {
        eyebrow: 'Stay in the story',
        title: 'Read and listen without breaking your rhythm.',
        body:
          'The reader follows the narration, keeps your place, and lets you settle into the text instead of fighting the interface.',
        stats: [
          { label: 'Narrated playback', value: 'Built in' },
          { label: 'Sleep timer', value: 'Ready' },
          { label: 'Reader controls', value: 'Fast' },
        ],
        highlights: [
          'Move from cover view to reading view with ease',
          'Keep your eyes on the passage being read',
          'Use simple playback and chapter controls',
        ],
      },
      {
        eyebrow: 'Always available',
        title: 'Download titles to your device for quieter offline reading.',
        body:
          'When you know what you want to keep, save it locally so it is there for the next flight, commute, or late-night reading session.',
        stats: [
          { label: 'Offline access', value: 'Yes' },
          { label: 'Saved audio exports', value: 'Available' },
          { label: 'Long-session ready', value: 'Yes' },
        ],
        highlights: [
          'Keep books on your device for later',
          'Take your reading session offline',
          'Settle in without waiting on the app',
        ],
      },
    ];

    const page = pages[pageIndex];

    return (
      <View style={styles.pageBody}>
        <View style={styles.copyBlock}>
          <Text style={styles.eyebrow}>{page.eyebrow}</Text>
          <Text style={[styles.pageTitle, isCompact && styles.pageTitleCompact]}>{page.title}</Text>
          <Text style={styles.pageBodyText}>{page.body}</Text>
        </View>

        <View style={styles.statsGrid}>
          {page.stats.map((stat) => (
            <View key={stat.label} style={styles.statCard}>
              <Text style={styles.statCardLabel}>{stat.label}</Text>
              <Text style={styles.statCardValue}>{stat.value}</Text>
            </View>
          ))}
        </View>

        <View style={styles.highlightList}>
          {page.highlights.map((highlight) => (
            <View key={highlight} style={styles.highlightRow}>
              <Ionicons name="checkmark-circle" size={18} color={AppPalette.accent} />
              <Text style={styles.highlightText}>{highlight}</Text>
            </View>
          ))}
        </View>
      </View>
    );
  };

  const renderIdentityStep = () => (
    <View style={styles.pageBody}>
      <View style={[styles.formCard, isCompact && styles.formCardCompact]}>
        <Text style={styles.eyebrow}>Personal setup</Text>
        <Text style={[styles.pageTitle, isCompact && styles.pageTitleCompact]}>
          Tell us who this reading room is for.
        </Text>
        <Text style={styles.pageBodyText}>
          We use this only to personalize your shelf and keep recommendations appropriate for you.
        </Text>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Name</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={AppPalette.textSubtle}
            style={styles.textInput}
            autoCapitalize="words"
            returnKeyType="next"
          />
        </View>

        <View style={styles.inputGroup}>
          <Text style={styles.inputLabel}>Birthdate</Text>
          <TextInput
            value={birthdate}
            onChangeText={(value) => setBirthdate(formatBirthdateInput(value))}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={AppPalette.textSubtle}
            style={styles.textInput}
            keyboardType="number-pad"
            returnKeyType="done"
          />
        </View>
      </View>
    </View>
  );

  const renderCategoryStep = () => (
    <View style={styles.pageBody}>
      <View style={[styles.formCard, styles.categoryFormCard, isCompact && styles.formCardCompact]}>
        <Text style={styles.eyebrow}>Pick your shelf</Text>
        <Text style={[styles.pageTitle, isCompact && styles.pageTitleCompact]}>
          Choose the categories you want waiting on day one.
        </Text>
        <Text style={styles.pageBodyText}>
          Select {MIN_CATEGORY_SELECTION} to {MAX_CATEGORY_SELECTION}. We will place these first in Explore.
        </Text>

        <View style={styles.selectionSummary}>
          <Text style={styles.selectionSummaryText}>
            {selectedCategories.length} selected
          </Text>
          <Text style={styles.selectionSummaryHint}>You can change this later in the app.</Text>
        </View>
        <ScrollView
          style={styles.categoryScroll}
          contentContainerStyle={styles.categoryGrid}
          showsVerticalScrollIndicator={false}
        >
          {GUTENDEX_CATEGORIES.map((category) => {
            const selected = favoriteCategoryIds.includes(category.id);
            return (
              <Pressable
                key={category.id}
                onPress={() => toggleCategory(category.id)}
                style={[
                  styles.categoryCard,
                  selected && styles.categoryCardSelected,
                ]}
              >
                <View style={[styles.categoryAccent, { backgroundColor: category.accent }]} />
                <View style={styles.categoryCopy}>
                  <Text style={[styles.categoryTitle, selected && styles.categoryTitleSelected]}>
                    {category.title}
                  </Text>
                  <Text style={styles.categorySubtitle} numberOfLines={2}>
                    {category.subtitle}
                  </Text>
                </View>
                <View style={styles.categoryAction}>
                  {selected ? (
                    <Ionicons name="checkmark-circle" size={18} color={AppPalette.accent} />
                  ) : (
                    <Ionicons name="add-circle-outline" size={18} color={AppPalette.textSubtle} />
                  )}
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );

  const pageStyle = {
    opacity: pageAnim,
    transform: [
      {
        translateY: pageAnim.interpolate({
          inputRange: [0, 1],
          outputRange: [18, 0],
        }),
      },
    ],
  };

  const renderPage = () => {
    if (step === 0) {
      return renderInfoStep(0);
    }

    if (step === 1) {
      return renderCategoryStep();
    }

    if (step >= 2 && step <= 4) {
      return renderInfoStep(step - 1);
    }

    if (step === 5) {
      return renderIdentityStep();
    }

    return null;
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{ headerShown: false }} />
      <KeyboardAvoidingView
        style={styles.keyboard}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={styles.shell}>
          <View style={styles.header}>
            <TouchableOpacity
              onPress={handleBack}
              style={[styles.backButton, step === 0 && styles.backButtonHidden]}
              disabled={step === 0 || isSubmitting}
              activeOpacity={0.85}
            >
              <Ionicons name="chevron-back" size={20} color={AppPalette.text} />
            </TouchableOpacity>

            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${((step + 1) / TOTAL_STEPS) * 100}%` }]} />
            </View>

            <Text style={styles.progressLabel}>
              {step + 1}/{TOTAL_STEPS}
            </Text>
          </View>

          <View style={styles.contentFrame}>
            <Animated.View style={[styles.pageFrame, pageStyle]}>
              {renderPage()}
            </Animated.View>
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.primaryButton, isSubmitting && styles.primaryButtonDisabled]}
              onPress={() => void handleNext()}
              disabled={isSubmitting}
              activeOpacity={0.9}
            >
              <Text style={styles.primaryButtonText}>
                {step === TOTAL_STEPS - 1 ? 'Continue to sign in' : 'Continue'}
              </Text>
              {isSubmitting ? (
                <ActivityIndicator size="small" color={AppPalette.surface} />
              ) : (
                <Ionicons name="arrow-forward" size={18} color={AppPalette.surface} />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppPalette.background,
  },
  keyboard: {
    flex: 1,
  },
  shell: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  backButtonHidden: {
    opacity: 0,
  },
  progressTrack: {
    flex: 1,
    height: 6,
    borderRadius: 999,
    backgroundColor: 'rgba(36, 28, 24, 0.08)',
    marginHorizontal: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: AppPalette.accent,
  },
  progressLabel: {
    width: 44,
    textAlign: 'right',
    color: AppPalette.textSubtle,
    fontSize: 12,
    fontWeight: '700',
  },
  statusRow: {
    display: 'none',
  },
  contentFrame: {
    flex: 1,
    justifyContent: 'center',
  },
  pageFrame: {
    flex: 1,
    justifyContent: 'center',
  },
  pageBody: {
    flex: 1,
    justifyContent: 'space-evenly',
  },
  copyBlock: {
    marginTop: 10,
  },
  eyebrow: {
    color: AppPalette.accent,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1.1,
    textTransform: 'uppercase',
  },
  pageTitle: {
    marginTop: 12,
    color: AppPalette.text,
    fontSize: 33,
    lineHeight: 37,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  pageTitleCompact: {
    fontSize: 29,
    lineHeight: 33,
  },
  pageBodyText: {
    marginTop: 12,
    color: AppPalette.textMuted,
    fontSize: 16,
    lineHeight: 24,
    fontFamily: 'Georgia',
  },
  statsGrid: {
    marginTop: 8,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  statCard: {
    width: '48.5%',
    minHeight: 82,
    borderRadius: 20,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
  },
  statCardLabel: {
    color: AppPalette.textSubtle,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.7,
    textTransform: 'uppercase',
  },
  statCardValue: {
    marginTop: 8,
    color: AppPalette.text,
    fontSize: 20,
    lineHeight: 22,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  highlightList: {
    marginTop: 10,
  },
  highlightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  highlightText: {
    flex: 1,
    marginLeft: 10,
    color: AppPalette.text,
    fontSize: 15,
    lineHeight: 20,
    fontFamily: 'Georgia',
  },
  formCard: {
    borderRadius: 28,
    padding: 24,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  formCardCompact: {
    padding: 20,
  },
  categoryFormCard: {
    flex: 1,
  },
  inputGroup: {
    marginTop: 18,
  },
  inputLabel: {
    marginBottom: 8,
    color: AppPalette.textSubtle,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  textInput: {
    minHeight: 56,
    borderRadius: 18,
    backgroundColor: AppPalette.background,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.26)',
    paddingHorizontal: 16,
    color: AppPalette.text,
    fontSize: 17,
    fontFamily: 'Georgia',
  },
  selectionSummary: {
    marginTop: 18,
    marginBottom: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectionSummaryText: {
    color: AppPalette.text,
    fontSize: 15,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  selectionSummaryHint: {
    color: AppPalette.textSubtle,
    fontSize: 12,
    fontFamily: 'Georgia',
  },
  categoryScroll: {
    flex: 1,
    marginTop: 2,
  },
  categoryGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  categoryCard: {
    width: '48%',
    minHeight: 108,
    borderRadius: 18,
    backgroundColor: AppPalette.background,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.22)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  categoryCardSelected: {
    borderColor: AppPalette.accent,
    backgroundColor: AppPalette.accentSoft,
  },
  categoryAccent: {
    width: 28,
    height: 6,
    borderRadius: 999,
    marginBottom: 10,
  },
  categoryCopy: {
    flex: 1,
  },
  categoryTitle: {
    color: AppPalette.text,
    fontSize: 15,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  categoryTitleSelected: {
    color: AppPalette.accentStrong,
  },
  categorySubtitle: {
    marginTop: 4,
    color: AppPalette.textSubtle,
    fontSize: 12,
    lineHeight: 16,
    fontFamily: 'Georgia',
  },
  categoryAction: {
    marginTop: 12,
    alignSelf: 'flex-end',
  },
  footer: {
    paddingTop: 18,
  },
  primaryButton: {
    minHeight: 62,
    borderRadius: 20,
    backgroundColor: AppPalette.accent,
    paddingHorizontal: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.72,
  },
  primaryButtonText: {
    color: AppPalette.surface,
    fontSize: 17,
    fontFamily: 'Georgia',
    fontWeight: '700',
    marginRight: 10,
  },
});
