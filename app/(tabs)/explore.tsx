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
import { getCachedTopic, setCachedTopic, clearCachedTopic, clearAllCache } from '@/utils/exploreCache';
// --- CONFIGURATION ---
const CATEGORIES = [
  { id: '1', title: 'Popular Fiction', topic: 'fiction' },
  { id: '2', title: 'Young Adult', topic: 'juvenile' },
  { id: '3', title: 'Classic Literature', topic: 'classic' },
  { id: '4', title: 'Mystery & Crime', topic: 'mystery' },
  { id: '5', title: 'Science Fiction', topic: 'science-fiction' },
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
      } catch (e) {
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
  }, []);

  // When global refreshToken changes (pull-to-refresh), force refresh and bypass cache
  useEffect(() => {
    if (refreshToken === undefined) return;
    (async () => {
      booksRef.current = [];
      setBooks([]);
      setNextUrl(`https://gutendex.com/books?topic=${topic}`);
      setInitialLoading(true);
      await fetchBooks(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [refreshToken]);

  return (
    <View style={styles.sectionContainer}>
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>{title}</Text>
          <TouchableOpacity onPress={async () => {
          await clearCachedTopic(topic);
          // reset state and fetch fresh
          booksRef.current = [];
          setBooks([]);
          setNextUrl(`https://gutendex.com/books?topic=${topic}`);
          setInitialLoading(true);
          await fetchBooks(true);
        }}><Text style={styles.seeAll}>See All</Text></TouchableOpacity>
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
          <ActivityIndicator color="#00d8b4" style={styles.loader} />
        ) : null}
      />
    </View>
  );
};

// --- MAIN LIBRARY SCREEN ---
export default function Explore() {
  const [refreshing, setRefreshing] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);

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
          <ActivityIndicator color="#00d8b4" size="small" />
        </View>
      ) : null}
      <View style={styles.headerContainer}>
        <Text style={styles.headerSub}>Discover</Text>
        <Text style={styles.headerTitle}>My Library</Text>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.mainWrapper}>
      <StatusBar barStyle="light-content" />

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
            tintColor="#00d8b4"
            colors={['#00d8b4']}
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
    backgroundColor: '#0F0F0F', // True dark mode
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  headerSub: {
    color: '#00d8b4',
    fontSize: 12,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 1.5,
    marginBottom: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  verticalScrollPadding: {
    paddingBottom: 40,
    paddingTop: 20,
  },
  pullRefreshStrip: {
    paddingTop: 20,
    paddingBottom: 20,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  pullRefreshText: {
    color: '#00d8b4',
    fontSize: 12,
    fontWeight: '600',
  },
  sectionContainer: {
    marginTop: 25,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 15,
  },
  sectionTitle: {
    color: '#F0F0F0',
    fontSize: 20,
    fontWeight: '700',
  },
  seeAll: {
    color: '#00d8b4',
    fontSize: 14,
    fontWeight: '600',
  },
  horizontalScrollPadding: {
    paddingLeft: 20,
    paddingRight: 10,
  },
  bookCard: {
    width: 140,
    marginRight: 18,
  },
  coverImage: {
    width: 140,
    height: 210,
    borderRadius: 8,
    backgroundColor: '#1A1A1A',
  },
  bookTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 10,
    lineHeight: 18,
  },
  bookAuthor: {
    color: '#888888',
    fontSize: 12,
    marginTop: 4,
  },
  loader: {
    justifyContent: 'center',
    alignItems: 'center',
    width: 100,
    height: 210,
  },

  // Skeleton Styles
  skeletonCover: {
    width: 140,
    height: 210,
    borderRadius: 8,
    backgroundColor: '#222',
  },
  skeletonText: {
    height: 14,
    backgroundColor: '#222',
    borderRadius: 4,
    marginTop: 10,
  },
});