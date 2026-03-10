import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  FlatList,
  Image,
  TouchableOpacity,
  Animated,
  Easing,
  ActivityIndicator,
  StatusBar,
  RefreshControl,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getCachedTopic, setCachedTopic, clearAllCache } from '@/utils/exploreCache';
import { AppPalette } from '@/constants/theme';
// --- CONFIGURATION ---
const CATEGORIES = [
  { id: '1', title: 'Non Fiction', topic: 'teen' },
  { id: '2', title: 'Classic Literature', topic: 'classic' },
  { id: '3', title: 'Mystery & Crime', topic: 'mystery' },
  { id: '4', title: 'Science Fiction', topic: 'science-fiction' },
    { id: '5', title: 'Young Adults', topic: 'ya' },
    { id: '6', title: 'Children', topic: 'children' },
];

// --- SKELETON COMPONENT ---
const SkeletonCard = () => {
  const shimmerValue = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    Animated.loop(
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
      ])
    ).start();
  }, [shimmerValue]);

  return (
    <View style={styles.bookCard}>
      <Animated.View style={[styles.skeletonCover, { opacity: shimmerValue }]} />
      <Animated.View style={[styles.skeletonText, { opacity: shimmerValue, width: '90%' }]} />
      <Animated.View style={[styles.skeletonText, { opacity: shimmerValue, width: '60%', height: 8 }]} />
    </View>
  );
};

// --- HORIZONTAL BOOK ROW (LAZY LOADED) ---
const TOPIC_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes
const MAX_CACHED_ITEMS = 200;
const inFlightRequests = new Map<string, Promise<any>>();

const BookSection = ({ title, topic, refreshToken }: { title: string; topic: string; refreshToken?: number }) => {
  const router = useRouter();
  const [books, setBooks] = useState<any[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(`https://gutendex.com/books?topic=${topic}`);
  const [loading, setLoading] = useState(false);
  const [initialLoading, setInitialLoading] = useState(true);
  const booksRef = useRef<any[]>([]);

  const fetchBooks = useCallback(async (forceRefresh = false) => {
    if (loading) return;
    if (!nextUrl && !forceRefresh) return;

    const url = nextUrl || `https://gutendex.com/books?topic=${topic}`;

    // Dedupe in-flight requests per URL
    if (inFlightRequests.has(url)) {
      try {
        await inFlightRequests.get(url);
      } catch {
        // ignore
      }
      return;
    }

    setLoading(true);
    console.log(`[Explore] fetchBooks start topic=${topic} url=${url} forceRefresh=${forceRefresh}`);
    const promise = (async () => {
      try {
        const response = await fetch(url);
        const data = await response.json();

        const formattedResults = data.results.map((book: any) => ({
          ...book,
          displayAuthor: book.authors[0]?.name
            ? book.authors[0].name.split(',').reverse().join(' ').trim()
            : 'Unknown Author'
        }));

        const combined = [...booksRef.current, ...formattedResults];
        booksRef.current = combined;
        setBooks(combined);
        setNextUrl(data.next);
        await setCachedTopic(topic, { books: combined, nextUrl: data.next, fetchedAt: Date.now() }, MAX_CACHED_ITEMS);
        console.log(`[Explore] fetched ${formattedResults.length} items for topic=${topic}, total=${combined.length}, next=${data.next}`);
      } catch (error) {
        console.error(`Error fetching ${topic}:`, error);
      } finally {
        setLoading(false);
        setInitialLoading(false);
        inFlightRequests.delete(url);
      }
    })();

    inFlightRequests.set(url, promise);
    return promise;
  }, [nextUrl, loading, topic]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      const cached = await getCachedTopic(topic, TOPIC_CACHE_TTL_MS);
      if (mounted && cached) {
        console.log(`[Explore] cache hit for topic=${topic} fetchedAt=${new Date(cached.fetchedAt).toISOString()}`);
        booksRef.current = cached.books;
        setBooks(cached.books);
        setNextUrl(cached.nextUrl);
        setInitialLoading(false);
        return;
      }
      if (mounted) console.log(`[Explore] cache miss for topic=${topic}`);
      if (mounted) fetchBooks();
    })();
    return () => { mounted = false; };
    // The initial cache bootstrap intentionally runs once per section mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When global refreshToken changes (pull-to-refresh), force refresh and bypass cache
  useEffect(() => {
    if (refreshToken === undefined) return;
    (async () => {
      booksRef.current = [];
      setBooks([]);
                setNextUrl(`https://gutendex.com/books?&page=${Math.floor(Math.random() * 10) + 1}&topic=${topic}`);
      setInitialLoading(true);
      await fetchBooks(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
          {/* <TouchableOpacity onPress={async () => {
          await clearCachedTopic(topic);
          // reset state and fetch fresh
          booksRef.current = [];
          setBooks([]);
                    setNextUrl(`https://gutendex.com/books?&page=${Math.floor(Math.random() * 10) + 1}&topic=$${topic}`);
          setInitialLoading(true);
          await fetchBooks(true);
        }}><Text style={styles.seeAll}>See All</Text></TouchableOpacity> */}
      </View>

      <FlatList
        horizontal
        data={initialLoading ? [1, 2, 3, 4] : books}
        keyExtractor={(item, index) => initialLoading ? `skel-${index}` : item.id.toString()}
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.horizontalScrollPadding}
        onEndReached={() => {
          fetchBooks(false);
        }}
        onEndReachedThreshold={0.5}
        renderItem={({ item }) => initialLoading ? (
          <SkeletonCard />
        ) : (
          <TouchableOpacity
            style={styles.bookCard}
            activeOpacity={0.8}
            onPress={() => {
              console.log('navigating with', JSON.stringify(item).slice(0,200));
              router.push({ pathname: '/BookDescription', params: { book: JSON.stringify(item) } });
            }}
          >
            <Image 
              source={{ uri: item.formats['image/jpeg'] }} 
              style={styles.coverImage} 
            />
            <Text style={styles.bookTitle} numberOfLines={2}>{item.title}</Text>
            <Text style={styles.bookAuthor} numberOfLines={1}>{item.displayAuthor}</Text>
          </TouchableOpacity>
        )}
        ListFooterComponent={loading && !initialLoading ? (
          <ActivityIndicator color={AppPalette.accent} style={styles.loader} />
        ) : null}
      />
    </View>
  );
};

// --- MAIN LIBRARY SCREEN ---
export default function Explore() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isHeroVisible, setIsHeroVisible] = useState(true);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await clearAllCache();
      setRefreshToken((t) => t + 1);
      // Keep spinner visible while children refetch (they each show skeletons)
      await new Promise((resolve) => setTimeout(resolve, 1500));
    } catch (e) {
      console.warn('Failed to clear explore cache on refresh', e);
    } finally {
      setRefreshing(false);
    }
  }, []);

  const HeaderComponent = () => (
    <>
      {refreshing ? (
        <View style={styles.pullRefreshStrip}>
          <ActivityIndicator color={AppPalette.accent} size="small" />
        </View>
      ) : null}
      <View style={styles.headerContainer}>
        <Text style={styles.headerSub}>Discover</Text>
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
        {isHeroVisible ? (
          <View style={styles.heroGraphic}>
            <View style={styles.heroInfoCard}>
              <TouchableOpacity
                onPress={() => setIsHeroVisible(false)}
                accessibilityLabel="Dismiss explore guide"
                style={styles.heroCloseButton}
              >
                <Ionicons name="close" size={18} color={AppPalette.textSubtle} />
              </TouchableOpacity>
              <View style={styles.heroInfoHeader}>
                <View style={styles.heroInfoBadge}>
                  <Ionicons name="compass-outline" size={16} color={AppPalette.surface} />
                </View>
                <View style={styles.heroInfoCopy}>
                  <Text style={styles.heroInfoTitle}>How Explore works</Text>
                  <Text style={styles.heroInfoSubtitle}>Browse by lane or jump straight into search.</Text>
                </View>
              </View>
              <View style={styles.heroInfoStats}>
                <View style={styles.heroInfoStat}>
                  <Text style={styles.heroInfoStatValue}>{CATEGORIES.length}</Text>
                  <Text style={styles.heroInfoStatLabel}>Curated lanes</Text>
                </View>
                <View style={styles.heroInfoDivider} />
                <View style={styles.heroInfoStat}>
                  <Text style={styles.heroInfoStatValue}>∞</Text>
                  <Text style={styles.heroInfoStatLabel}>Scroll for more</Text>
                </View>
              </View>
              <View style={styles.heroInfoTips}>
                <View style={styles.heroInfoTip}>
                  <Ionicons name="albums-outline" size={16} color={AppPalette.accentStrong} />
                  <Text style={styles.heroInfoTipText}>Each row opens a different genre feed.</Text>
                </View>
                <View style={styles.heroInfoTip}>
                  <Ionicons name="search-outline" size={16} color={AppPalette.accentStrong} />
                  <Text style={styles.heroInfoTipText}>Use search when you already know the title or author.</Text>
                </View>
              </View>
            </View>
          </View>
        ) : null}
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.mainWrapper}>
      <StatusBar barStyle="dark-content" />

      <FlatList
        data={CATEGORIES}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={HeaderComponent}
        renderItem={({ item }) => (
          <BookSection title={item.title} topic={item.topic} refreshToken={refreshToken} />
        )}
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

// --- STYLES ---
const styles = StyleSheet.create({
  mainWrapper: {
    flex: 1,
    backgroundColor: AppPalette.background,
    paddingBottom: 30,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 14,
  },
  headerSub: {
    fontFamily: 'Georgia',
    color: AppPalette.accent,
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 6,
  },
  headerTitleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    fontFamily: 'Georgia',
    color: AppPalette.text,
    fontSize: 38,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  verticalScrollPadding: {
    paddingBottom: 120,
    paddingTop: 12,
  },
  pullRefreshStrip: {
    paddingTop: 12,
    paddingBottom: 12,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pullRefreshText: {
    fontFamily: 'Georgia',
    color: '#00d8b4',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionContainer: {
    marginTop: 28,
  },
  heroGraphic: {
    marginTop: 20,
  },
  heroInfoCard: {
    borderRadius: 24,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    padding: 18,
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.08,
    shadowRadius: 14,
    elevation: 2,
  },
  heroCloseButton: {
    position: 'absolute',
    top: 12,
    right: 12,
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppPalette.background,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.18)',
  },
  heroInfoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 40,
  },
  heroInfoBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  heroInfoCopy: {
    flex: 1,
  },
  heroInfoTitle: {
    color: AppPalette.text,
    fontFamily: 'Georgia',
    fontSize: 22,
    fontWeight: '700',
  },
  heroInfoSubtitle: {
    color: AppPalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 4,
  },
  heroInfoStats: {
    marginTop: 16,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppPalette.surfaceStrong,
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 12,
  },
  heroInfoStat: {
    flex: 1,
    alignItems: 'center',
  },
  heroInfoStatValue: {
    color: AppPalette.text,
    fontSize: 22,
    fontWeight: '800',
  },
  heroInfoStatLabel: {
    color: AppPalette.textSubtle,
    fontSize: 12,
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  heroInfoDivider: {
    width: 1,
    alignSelf: 'stretch',
    backgroundColor: AppPalette.border,
  },
  heroInfoTips: {
    marginTop: 16,
    gap: 12,
  },
  heroInfoTip: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: AppPalette.background,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.18)',
  },
  heroInfoTipText: {
    flex: 1,
    marginLeft: 10,
    color: AppPalette.textMuted,
    fontSize: 14,
    lineHeight: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    fontFamily: 'Georgia',
    color: AppPalette.text,
    fontSize: 22,
    fontWeight: '700',
  },
  seeAll: {
    fontFamily: 'Georgia',
    color: '#00d8b4',
    fontSize: 14,
    fontWeight: '600',
  },
  horizontalScrollPadding: {
    paddingLeft: 20,
    paddingRight: 10,
    paddingBottom: 8,
  },
  bookCard: {
    width: 146,
    marginRight: 18,
  },
  coverImage: {
    width: 146,
    height: 218,
    borderRadius: 18,
    backgroundColor: AppPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
  },
  bookTitle: {
    fontFamily: 'Georgia',
    color: AppPalette.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 12,
    lineHeight: 20,
  },
  bookAuthor: {
    fontFamily: 'Georgia',
    color: AppPalette.textSubtle,
    fontSize: 12,
    marginTop: 5,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
  },
  loader: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: 218,
  },

  // Skeleton Styles
  skeletonCover: {
    width: 146,
    height: 218,
    borderRadius: 18,
    backgroundColor: AppPalette.surfaceStrong,
  },
  skeletonText: {
    height: 14,
    backgroundColor: AppPalette.surfaceStrong,
    borderRadius: 4,
    marginTop: 10,
  },
  searchButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 2,
  },
});
