import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  FlatList,
  Image,
  RefreshControl,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';

import { AppPalette } from '@/constants/theme';
import { clearAllCache, getCachedTopic, setCachedTopic } from '@/utils/exploreCache';
import {
  buildGutendexTopicUrl,
  fetchGutendexTopicFeed,
  type GutendexCategory,
  resolveExploreCategories,
  resolveGutendexCategories,
} from '@/utils/gutendex';
import { getOnboardingState } from '@/utils/onboardingRepository';
import { getUserSettings } from '@/utils/userSettingsRepository';

const TOPIC_CACHE_TTL_MS = 15 * 60 * 1000;
const MAX_CACHED_ITEMS = 200;
const inFlightRequests = new Map<string, Promise<void>>();

const sameCategoryList = (left: GutendexCategory[], right: GutendexCategory[]) => {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((category, index) => category.id === right[index]?.id);
};

const SkeletonCard = () => {
  const shimmerValue = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerValue, {
          toValue: 1,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
        Animated.timing(shimmerValue, {
          toValue: 0.3,
          duration: 800,
          easing: Easing.linear,
          useNativeDriver: true,
        }),
      ]),
    );

    animation.start();

    return () => {
      animation.stop();
    };
  }, [shimmerValue]);

  return (
    <View style={styles.bookCard}>
      <Animated.View style={[styles.skeletonCover, { opacity: shimmerValue }]} />
      <Animated.View style={[styles.skeletonText, { opacity: shimmerValue, width: '86%' }]} />
      <Animated.View style={[styles.skeletonText, { opacity: shimmerValue, width: '54%', height: 8 }]} />
    </View>
  );
};

const BookSection = ({ category, refreshToken }: { category: GutendexCategory; refreshToken?: number }) => {
  const router = useRouter();
  const [books, setBooks] = useState<any[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(buildGutendexTopicUrl(category.topic));
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const booksRef = useRef<any[]>([]);
  const loadingRef = useRef(false);
  const mountedRef = useRef(true);

  const fetchBooks = useCallback(
    async (requestUrl: string, replaceExisting: boolean) => {
      if (!requestUrl) {
        return;
      }

      if (loadingRef.current && !replaceExisting) {
        return;
      }

      if (inFlightRequests.has(requestUrl)) {
        await inFlightRequests.get(requestUrl);
        return;
      }

      loadingRef.current = true;
      setLoading(true);

      const request = (async () => {
        try {
          const result = await fetchGutendexTopicFeed(requestUrl);
          if (!mountedRef.current) {
            return;
          }

          const combined = replaceExisting ? result.books : [...booksRef.current, ...result.books];
          booksRef.current = combined;
          setBooks(combined);
          setNextUrl(result.nextUrl);
          await setCachedTopic(
            category.topic,
            {
              books: combined,
              nextUrl: result.nextUrl,
              fetchedAt: Date.now(),
            },
            MAX_CACHED_ITEMS,
          );
        } catch (error) {
          console.warn(`Failed to fetch category "${category.topic}"`, error);
        } finally {
          inFlightRequests.delete(requestUrl);
          loadingRef.current = false;
          if (mountedRef.current) {
            setLoading(false);
            setInitialLoading(false);
          }
        }
      })();

      inFlightRequests.set(requestUrl, request);
      await request;
    },
    [category.topic],
  );

  useEffect(() => {
    mountedRef.current = true;

    const hydrate = async () => {
      const initialUrl = buildGutendexTopicUrl(category.topic);
      booksRef.current = [];
      setBooks([]);
      setNextUrl(initialUrl);
      setInitialLoading(true);

      const cached = await getCachedTopic(category.topic, TOPIC_CACHE_TTL_MS);
      if (!mountedRef.current) {
        return;
      }

      if (cached) {
        booksRef.current = cached.books;
        setBooks(cached.books);
        setNextUrl(cached.nextUrl);
        setInitialLoading(false);
        return;
      }

      await fetchBooks(initialUrl, true);
    };

    void hydrate();

    return () => {
      mountedRef.current = false;
      loadingRef.current = false;
    };
  }, [category.topic, fetchBooks]);

  useEffect(() => {
    if (refreshToken === undefined) {
      return;
    }

    const refreshUrl = buildGutendexTopicUrl(category.topic, Math.floor(Math.random() * 8) + 1);

    booksRef.current = [];
    setBooks([]);
    setNextUrl(refreshUrl);
    setInitialLoading(true);
    void fetchBooks(refreshUrl, true);
  }, [category.topic, fetchBooks, refreshToken]);

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <View style={styles.sectionCopy}>
          <Text style={styles.sectionTitle}>{category.title}</Text>
          <Text style={styles.sectionSubtitle}>{category.subtitle}</Text>
        </View>
        <View style={[styles.sectionAccent, { backgroundColor: category.accent }]} />
      </View>

      <FlatList
        horizontal
        data={initialLoading ? [1, 2, 3, 4] : books}
        keyExtractor={(item, index) =>
          initialLoading ? `skeleton-${category.id}-${index}` : String(item.id)
        }
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScrollPadding}
        onEndReached={() => {
          if (nextUrl) {
            void fetchBooks(nextUrl, false);
          }
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) =>
          initialLoading ? (
            <SkeletonCard />
          ) : (
            <TouchableOpacity
              style={styles.bookCard}
              activeOpacity={0.86}
              onPress={() => {
                router.push({ pathname: '/BookDescription', params: { book: JSON.stringify(item) } });
              }}
            >
              <Image source={{ uri: item.formats['image/jpeg'] }} style={styles.coverImage} />
              <Text style={styles.bookTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.bookAuthor} numberOfLines={1}>
                {item.displayAuthor}
              </Text>
            </TouchableOpacity>
          )
        }
        ListFooterComponent={
          loading && !initialLoading ? <ActivityIndicator color={AppPalette.accent} style={styles.loader} /> : null
        }
      />
    </View>
  );
};

export default function Explore() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState<number | undefined>(undefined);
  const [displayedCategories, setDisplayedCategories] = useState<GutendexCategory[]>(
    () => resolveExploreCategories([]),
  );
  const [favoriteCategories, setFavoriteCategories] = useState<GutendexCategory[]>([]);
  const [profileName, setProfileName] = useState('');

  useEffect(() => {
    let active = true;

    const hydratePreferences = async () => {
      const localSettings = await getUserSettings();
      const onboardingState = await getOnboardingState();
      if (!active) {
        return;
      }

      const categoryIds = localSettings.favoriteCategoryIds.length > 0
        ? localSettings.favoriteCategoryIds
        : onboardingState.favoriteCategoryIds;
      const nextProfileName = localSettings.profileName.trim() || onboardingState.name.trim();
      const nextFavoriteCategories = resolveGutendexCategories(categoryIds);
      const nextDisplayedCategories = resolveExploreCategories(categoryIds);

      setProfileName((previous) => (previous === nextProfileName ? previous : nextProfileName));
      setFavoriteCategories((previous) =>
        sameCategoryList(previous, nextFavoriteCategories) ? previous : nextFavoriteCategories,
      );
      setDisplayedCategories((previous) =>
        sameCategoryList(previous, nextDisplayedCategories) ? previous : nextDisplayedCategories,
      );
    };

    void hydratePreferences();

    return () => {
      active = false;
    };
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);

    try {
      await clearAllCache();
      setRefreshToken((value) => (value ?? 0) + 1);
      await new Promise((resolve) => setTimeout(resolve, 1100));
    } catch (error) {
      console.warn('Failed to refresh Explore', error);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const HeaderComponent = () => (
    <>
      <View style={styles.headerContainer}>
        <Text style={styles.headerSub}>
          {profileName ? `Curated for ${profileName}` : 'Explore'}
        </Text>
        <View style={styles.headerTitleRow}>
          <Text style={styles.headerTitle}>Find new titles</Text>
          <TouchableOpacity
            onPress={() => router.push('/search')}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            style={styles.searchButton}
          >
            <Ionicons name="search" size={20} color={AppPalette.text} />
          </TouchableOpacity>
        </View>

        <View style={styles.heroCard}>
          <View style={styles.heroTopRow}>
            <View>
              <Text style={styles.heroEyebrow}>Your first lanes</Text>
              <Text style={styles.heroTitle}>Selected categories appear first.</Text>
            </View>
            <View style={styles.heroBadge}>
              <Ionicons name="sparkles-outline" size={18} color={AppPalette.surface} />
            </View>
          </View>
          <Text style={styles.heroCopy}>
            Pull to refresh for a different mix, or jump into search when you already know the title.
          </Text>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.chipRow}
          >
            {favoriteCategories.length > 0 ? favoriteCategories.map((category) => (
              <View key={category.id} style={styles.favoriteChip}>
                <View style={[styles.favoriteDot, { backgroundColor: category.accent }]} />
                <Text style={styles.favoriteChipText}>{category.title}</Text>
              </View>
            )) : (
              <View style={styles.favoriteChip}>
                <View style={[styles.favoriteDot, { backgroundColor: AppPalette.accent }]} />
                <Text style={styles.favoriteChipText}>Personalized shelves</Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>

      {refreshing ? (
        <View style={styles.pullRefreshStrip}>
          <ActivityIndicator color={AppPalette.accent} size="small" />
        </View>
      ) : null}
    </>
  );

  return (
    <SafeAreaView style={styles.mainWrapper}>
      <StatusBar barStyle="dark-content" />

      <FlatList
        data={displayedCategories}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={HeaderComponent}
        renderItem={({ item }) => <BookSection category={item} refreshToken={refreshToken} />}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            tintColor={AppPalette.accent}
            colors={[AppPalette.accent]}
            progressViewOffset={24}
          />
        }
        contentContainerStyle={styles.verticalScrollPadding}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: AppPalette.background,
  },
  headerContainer: {
    paddingTop: 16,
    paddingHorizontal: 20,
  },
  headerSub: {
    color: AppPalette.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.1,
  },
  headerTitleRow: {
    marginTop: 6,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: AppPalette.text,
    fontSize: 34,
    lineHeight: 38,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  searchButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCard: {
    marginTop: 18,
    borderRadius: 26,
    padding: 20,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 2,
  },
  heroTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  heroEyebrow: {
    color: AppPalette.textSubtle,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroTitle: {
    marginTop: 4,
    color: AppPalette.text,
    fontSize: 24,
    lineHeight: 28,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  heroBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroCopy: {
    marginTop: 12,
    color: AppPalette.textMuted,
    fontSize: 14,
    lineHeight: 21,
    fontFamily: 'Georgia',
  },
  chipRow: {
    paddingTop: 16,
    paddingRight: 8,
  },
  favoriteChip: {
    marginRight: 10,
    borderRadius: 999,
    backgroundColor: AppPalette.background,
    paddingHorizontal: 12,
    paddingVertical: 9,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.20)',
  },
  favoriteDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  favoriteChipText: {
    color: AppPalette.text,
    fontSize: 13,
    fontWeight: '700',
  },
  pullRefreshStrip: {
    paddingTop: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verticalScrollPadding: {
    paddingBottom: 50,
    paddingTop: 10,
  },
  sectionContainer: {
    marginTop: 26,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 14,
  },
  sectionCopy: {
    flex: 1,
    marginRight: 12,
  },
  sectionTitle: {
    color: AppPalette.text,
    fontSize: 21,
    lineHeight: 25,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  sectionSubtitle: {
    marginTop: 5,
    color: AppPalette.textSubtle,
    fontSize: 13,
    lineHeight: 18,
    fontFamily: 'Georgia',
  },
  sectionAccent: {
    width: 8,
    height: 34,
    borderRadius: 999,
  },
  horizontalScrollPadding: {
    paddingLeft: 20,
    paddingRight: 8,
  },
  bookCard: {
    width: 138,
    marginRight: 16,
  },
  coverImage: {
    width: 138,
    height: 208,
    borderRadius: 10,
    backgroundColor: AppPalette.surfaceStrong,
  },
  bookTitle: {
    marginTop: 10,
    color: AppPalette.text,
    fontSize: 14,
    lineHeight: 18,
    fontFamily: 'Georgia',
    fontWeight: '700',
  },
  bookAuthor: {
    marginTop: 4,
    color: AppPalette.textSubtle,
    fontSize: 12,
    fontFamily: 'Georgia',
  },
  loader: {
    width: 72,
    height: 208,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skeletonCover: {
    width: 138,
    height: 208,
    borderRadius: 10,
    backgroundColor: AppPalette.surfaceStrong,
  },
  skeletonText: {
    height: 12,
    borderRadius: 999,
    backgroundColor: AppPalette.surfaceStrong,
    marginTop: 10,
  },
});
