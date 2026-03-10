import React, { useRef, useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ViewStyle,
  TextStyle,
  Keyboard,
  Animated,
  Dimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Book } from '@/components/BookCard.components';
import { BookGrid } from '@/components/BookGrid.component';
import { AppPalette } from '@/constants/theme';
import { enqueueUserSearchSync } from '@/services/syncService';

const GUTENDEX_BASE_URL = 'https://gutendex.com/books';
const { width } = Dimensions.get('window');

// Calculate skeleton dimensions based on a 3-column or 2-column grid (adjust as needed for your BookGrid)
const SKELETON_COLUMNS = 3;
const SKELETON_PADDING = 16;
const SKELETON_GAP = 12;
const SKELETON_WIDTH = (width - SKELETON_PADDING * 2 - SKELETON_GAP * (SKELETON_COLUMNS - 1)) / SKELETON_COLUMNS;

interface GutendexAuthor {
  name: string;
}

interface GutendexBook {
  id: number;
  title: string;
  authors: GutendexAuthor[];
  formats: Record<string, string>;
}

interface GutendexResponse {
  count: number;
  next: string | null;
  previous: string | null;
  results: GutendexBook[];
}

type SearchResultBook = Book & { raw: GutendexBook };

const mapGutendexBookToCard = (book: GutendexBook): SearchResultBook => {
  const rawAuthor = book.authors?.[0]?.name || 'Unknown Author';
  const displayAuthor = rawAuthor.includes(',')
    ? rawAuthor.split(',').reverse().join(' ').trim()
    : rawAuthor;

  return {
    id: `gutendex-${book.id}`,
    title: book.title,
    author: displayAuthor,
    cover: book.formats['image/jpeg'] || null,
    uri: `gutendex://book/${book.id}`,
    raw: book,
  };
};

const buildSearchUrl = (query: string) => `${GUTENDEX_BASE_URL}?search=${encodeURIComponent(query)}`;

const fetchBooks = async (
  url: string,
): Promise<{ books: SearchResultBook[]; nextUrl: string | null }> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Gutendex error: ${res.status}`);
  const data: GutendexResponse = await res.json();
  const books = data.results.map(mapGutendexBookToCard);
  return { books, nextUrl: data.next };
};

export default function SearchScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  
  const activeQuery = useRef('');
  const nextUrlRef = useRef<string | null>(null);

  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<SearchResultBook[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Animation value for the pulsing skeleton loader
  const pulseAnim = useRef(new Animated.Value(0.3)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const scanAnim = useRef(new Animated.Value(0)).current;

  // Auto-focus the search bar when the screen mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  // Handle the pulse animation lifecycle
  useEffect(() => {
    if (isLoading) {
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 0.7,
            duration: 800,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 0.3,
            duration: 800,
            useNativeDriver: true,
          }),
        ])
      ).start();
    } else {
      pulseAnim.stopAnimation();
    }
  }, [isLoading, pulseAnim]);

  useEffect(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(floatAnim, {
          toValue: 1,
          duration: 2800,
          useNativeDriver: true,
        }),
        Animated.timing(floatAnim, {
          toValue: 0,
          duration: 2800,
          useNativeDriver: true,
        }),
      ])
    ).start();
  }, [floatAnim]);

  useEffect(() => {
    if (!isLoading) {
      scanAnim.stopAnimation();
      scanAnim.setValue(0);
      return;
    }

    Animated.loop(
      Animated.timing(scanAnim, {
        toValue: 1,
        duration: 1700,
        useNativeDriver: true,
      })
    ).start();
  }, [isLoading, scanAnim]);

  const runSearch = useCallback(async (q: string, append: boolean) => {
    if (!q.trim()) {
      setBooks([]);
      nextUrlRef.current = null;
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    const requestUrl = append ? nextUrlRef.current : buildSearchUrl(q);
    if (!requestUrl) return;

    activeQuery.current = q;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const result = await fetchBooks(requestUrl);
      if (activeQuery.current !== q) return;
      setBooks((prev) => (append ? [...prev, ...result.books] : result.books));
      nextUrlRef.current = result.nextUrl;
    } catch {
      if (activeQuery.current !== q) return;
      setError('Failed to load results. Check your connection.');
    } finally {
      if (activeQuery.current === q) {
        setIsLoading(false);
        setIsLoadingMore(false);
      }
    }
  }, []);

  const handleSearchSubmit = useCallback(() => {
    Keyboard.dismiss();
    
    const normalizedQuery = query.trim();
    if (!normalizedQuery) return;

    setBooks([]);
    nextUrlRef.current = null;
    
    void enqueueUserSearchSync(normalizedQuery);
    void runSearch(normalizedQuery, false);
  }, [query, runSearch]);

  const handleEndReached = useCallback(() => {
    if (isLoadingMore || isLoading || !nextUrlRef.current || !activeQuery.current.trim()) return;
    void runSearch(activeQuery.current, true);
  }, [isLoadingMore, isLoading, runSearch]);

  const handleBookPress = (book: Book) => {
    const selectedBook = books.find((item) => item.id === book.id);
    if (!selectedBook) return;

    router.push({
      pathname: '/BookDescription',
      params: { book: JSON.stringify(selectedBook.raw) },
    });
  };

  const renderSkeletonLoader = () => (
    <View>
      <View style={styles.searchingHero}>
        <View style={styles.searchingGraphic}>
          <Animated.View
            style={[
              styles.scanBeam,
              {
                transform: [
                  {
                    translateX: scanAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-150, 170],
                    }),
                  },
                ],
              },
            ]}
          />
          <View style={styles.searchingStack}>
            <View style={[styles.searchingCard, styles.searchingCardBack]} />
            <View style={[styles.searchingCard, styles.searchingCardMid]} />
            <View style={styles.searchingCardFront}>
              <Ionicons name="sparkles-outline" size={28} color={AppPalette.accent} />
              <Text style={styles.searchingCardTitle}>Scanning the catalog</Text>
              <Text style={styles.searchingCardMeta}>Matching titles, authors, and editions</Text>
            </View>
          </View>
        </View>
      </View>

      <View style={styles.skeletonContainer}>
        {Array.from({ length: 9 }).map((_, index) => (
          <Animated.View 
            key={index} 
            style={[styles.skeletonCard, { opacity: pulseAnim }]}
          >
            <View style={styles.skeletonCover} />
            <View style={styles.skeletonTitle} />
            <View style={styles.skeletonAuthor} />
          </Animated.View>
        ))}
      </View>
    </View>
  );

  const renderIdleGraphic = () => {
    const paperFloat = floatAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, -10],
    });
    const tokenFloat = floatAnim.interpolate({
      inputRange: [0, 1],
      outputRange: [0, 12],
    });
    const orbit = floatAnim.interpolate({
      inputRange: [0, 1],
      outputRange: ['-8deg', '8deg'],
    });

    return (
      <View style={styles.discoveryPanel}>
        <Text style={styles.discoveryEyebrow}>Discover the next one</Text>
        <Text style={styles.discoveryTitle}>Search the open stacks</Text>
        <Text style={styles.discoveryText}>
          Look up a title, author, or subject and browse a calmer catalog experience.
        </Text>

        <View style={styles.discoveryGraphic}>
          <Animated.View
            style={[
              styles.discoveryOrbit,
              {
                transform: [{ rotate: orbit }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.discoveryToken,
              {
                transform: [{ translateY: tokenFloat }],
              },
            ]}
          >
            <Ionicons name="search" size={18} color={AppPalette.surface} />
          </Animated.View>
          <Animated.View
            style={[
              styles.discoveryBook,
              styles.discoveryBookLarge,
              {
                transform: [{ translateY: paperFloat }, { rotate: '-8deg' }],
              },
            ]}
          />
          <Animated.View
            style={[
              styles.discoveryBook,
              styles.discoveryBookSmall,
              {
                transform: [{ translateY: tokenFloat }, { rotate: '10deg' }],
              },
            ]}
          />
          <View style={styles.discoveryDesk}>
            <View style={styles.discoveryDeskLine} />
            <View style={styles.discoveryDeskLineShort} />
          </View>
        </View>

        <View style={styles.discoveryChips}>
          <View style={styles.discoveryChip}>
            <Ionicons name="library-outline" size={14} color={AppPalette.accentStrong} />
            <Text style={styles.discoveryChipText}>Classics</Text>
          </View>
          <View style={styles.discoveryChip}>
            <Ionicons name="person-outline" size={14} color={AppPalette.accentStrong} />
            <Text style={styles.discoveryChipText}>Authors</Text>
          </View>
          <View style={styles.discoveryChip}>
            <Ionicons name="bookmark-outline" size={14} color={AppPalette.accentStrong} />
            <Text style={styles.discoveryChipText}>Subjects</Text>
          </View>
        </View>
      </View>
    );
  };

  const renderHeader = () => {
    const hasSearched = activeQuery.current.trim() !== '' && !isLoading && !isLoadingMore;
    const noResults = hasSearched && books.length === 0 && !error;

    return (
      <View style={styles.resultsHeader}>
        {isLoading && books.length > 0 ? (
          // If we already have books but are running a fresh search (like changing a query mid-view)
          <View style={styles.inlineLoader}>
            <ActivityIndicator size="small" color={AppPalette.accent} />
            <Text style={styles.inlineLoaderText}>Updating results...</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : books.length > 0 ? (
          <Text style={styles.resultsLabel}>Results</Text>
        ) : noResults ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color={AppPalette.borderStrong} style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptyText}>{`We couldn't find anything for "${activeQuery.current}".`}</Text>
            
            <TouchableOpacity 
              style={styles.homeButton} 
              activeOpacity={0.7}
              onPress={() => router.push('/')}
            >
              <Ionicons name="library-outline" size={18} color={AppPalette.accent} style={{ marginRight: 8 }} />
              <Text style={styles.homeButtonText}>Browse Library</Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search bar row */}
      <View style={styles.searchRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={28} color={AppPalette.text} />
        </TouchableOpacity>
        
        <View style={styles.inputWrapper}>
          <Ionicons name="search" size={18} color={AppPalette.textSubtle} style={styles.inputIcon} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Search books, authors…"
            placeholderTextColor={AppPalette.textSubtle}
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            onSubmitEditing={handleSearchSubmit}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>

        <TouchableOpacity onPress={handleSearchSubmit} style={styles.searchActionBtn}>
          <Text style={styles.searchActionText}>Search</Text>
        </TouchableOpacity>
      </View>

      {/* Main Content Area */}
      {!activeQuery.current.trim() && !isLoading && books.length === 0 ? (
        renderIdleGraphic()
      ) : isLoading && books.length === 0 ? (
        // Show Modern Skeleton Loader for initial fresh searches
        renderSkeletonLoader()
      ) : (
        // Show Book Grid once data arrives (or if empty state is needed)
        <BookGrid
          books={books}
          onPress={handleBookPress}
          onEndReached={handleEndReached}
          isLoadingMore={isLoadingMore}
          ListHeaderComponent={renderHeader()}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: AppPalette.background,
  } as ViewStyle,
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 16,
    gap: 12,
  } as ViewStyle,
  backButton: {
    padding: 8,
    marginLeft: -4,
    borderRadius: 14,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
  } as ViewStyle,
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppPalette.surface,
    borderRadius: 16,
    paddingHorizontal: 12,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
  } as ViewStyle,
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: AppPalette.text,
    fontSize: 16,
    height: '100%',
    fontFamily: 'Georgia',
  } as TextStyle,
  searchActionBtn: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 14,
    backgroundColor: AppPalette.accent,
  } as ViewStyle,
  searchActionText: {
    color: AppPalette.surface,
    fontSize: 15,
    fontWeight: '600',
  } as TextStyle,
  discoveryPanel: {
    marginHorizontal: 20,
    marginTop: 12,
    paddingHorizontal: 22,
    paddingVertical: 24,
    backgroundColor: AppPalette.surface,
    borderRadius: 28,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 20,
    elevation: 3,
  } as ViewStyle,
  discoveryEyebrow: {
    color: AppPalette.accent,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginBottom: 8,
  } as TextStyle,
  discoveryTitle: {
    color: AppPalette.text,
    fontFamily: 'Georgia',
    fontSize: 30,
    fontWeight: '700',
    letterSpacing: -0.8,
  } as TextStyle,
  discoveryText: {
    color: AppPalette.textMuted,
    fontSize: 15,
    lineHeight: 24,
    marginTop: 10,
    maxWidth: '92%',
  } as TextStyle,
  discoveryGraphic: {
    height: 220,
    marginTop: 24,
    justifyContent: 'flex-end',
    alignItems: 'center',
  } as ViewStyle,
  discoveryOrbit: {
    position: 'absolute',
    top: 12,
    width: 180,
    height: 180,
    borderRadius: 90,
    borderWidth: 1,
    borderColor: 'rgba(47, 107, 98, 0.12)',
  } as ViewStyle,
  discoveryToken: {
    position: 'absolute',
    top: 32,
    right: 44,
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: AppPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 3,
  } as ViewStyle,
  discoveryBook: {
    position: 'absolute',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 3,
  } as ViewStyle,
  discoveryBookLarge: {
    left: 44,
    bottom: 42,
    width: 116,
    height: 154,
    backgroundColor: AppPalette.accentSoft,
  } as ViewStyle,
  discoveryBookSmall: {
    right: 44,
    bottom: 54,
    width: 96,
    height: 132,
    backgroundColor: AppPalette.backgroundMuted,
  } as ViewStyle,
  discoveryDesk: {
    width: '100%',
    height: 82,
    borderRadius: 26,
    backgroundColor: AppPalette.surfaceStrong,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.22)',
    paddingHorizontal: 22,
    paddingTop: 22,
  } as ViewStyle,
  discoveryDeskLine: {
    width: '56%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(47, 107, 98, 0.16)',
    marginBottom: 10,
  } as ViewStyle,
  discoveryDeskLineShort: {
    width: '38%',
    height: 8,
    borderRadius: 999,
    backgroundColor: 'rgba(36, 28, 24, 0.08)',
  } as ViewStyle,
  discoveryChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 18,
  } as ViewStyle,
  discoveryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    backgroundColor: AppPalette.background,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.2)',
  } as ViewStyle,
  discoveryChipText: {
    color: AppPalette.accentStrong,
    fontSize: 13,
    fontWeight: '600',
  } as TextStyle,
  
  /* Header & Inline Loader Styles */
  resultsHeader: {
    minHeight: 32,
    justifyContent: 'center',
    marginBottom: 20,
    marginTop: 4,
  } as ViewStyle,
  resultsLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: AppPalette.accent,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  } as TextStyle,
  inlineLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  inlineLoaderText: {
    color: AppPalette.textSubtle,
    fontSize: 13,
    fontWeight: '500',
  } as TextStyle,
  errorText: {
    color: AppPalette.danger,
    fontSize: 14,
    textAlign: 'center',
  } as TextStyle,

  /* Skeleton Grid Styles */
  skeletonContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: SKELETON_PADDING,
    gap: SKELETON_GAP,
    paddingTop: 8,
  } as ViewStyle,
  searchingHero: {
    marginHorizontal: 20,
    marginTop: 6,
    marginBottom: 18,
    padding: 20,
    backgroundColor: AppPalette.surface,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    overflow: 'hidden',
  } as ViewStyle,
  searchingGraphic: {
    minHeight: 164,
    justifyContent: 'center',
  } as ViewStyle,
  scanBeam: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 72,
    backgroundColor: 'rgba(47, 107, 98, 0.08)',
    borderRadius: 999,
  } as ViewStyle,
  searchingStack: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 164,
  } as ViewStyle,
  searchingCard: {
    position: 'absolute',
    width: 196,
    height: 124,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.22)',
  } as ViewStyle,
  searchingCardBack: {
    backgroundColor: AppPalette.backgroundMuted,
    transform: [{ translateY: -8 }, { rotate: '-6deg' }],
  } as ViewStyle,
  searchingCardMid: {
    backgroundColor: AppPalette.accentSoft,
    transform: [{ translateY: 8 }, { rotate: '6deg' }],
  } as ViewStyle,
  searchingCardFront: {
    width: 216,
    minHeight: 136,
    borderRadius: 28,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 22,
  } as ViewStyle,
  searchingCardTitle: {
    color: AppPalette.text,
    fontFamily: 'Georgia',
    fontSize: 20,
    fontWeight: '700',
    marginTop: 10,
  } as TextStyle,
  searchingCardMeta: {
    color: AppPalette.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 19,
  } as TextStyle,
  skeletonCard: {
    width: SKELETON_WIDTH,
    marginBottom: 24,
  } as ViewStyle,
  skeletonCover: {
    width: '100%',
    aspectRatio: 2 / 3, // Standard book cover ratio
    backgroundColor: AppPalette.surfaceStrong,
    borderRadius: 18,
    marginBottom: 12,
  } as ViewStyle,
  skeletonTitle: {
    width: '85%',
    height: 12,
    backgroundColor: AppPalette.surfaceStrong,
    borderRadius: 4,
    marginBottom: 8,
  } as ViewStyle,
  skeletonAuthor: {
    width: '60%',
    height: 10,
    backgroundColor: AppPalette.surfaceStrong,
    borderRadius: 4,
  } as ViewStyle,

  /* Empty State Styles */
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
  } as ViewStyle,
  emptyIcon: {
    marginBottom: 16,
  } as TextStyle,
  emptyTitle: {
    color: AppPalette.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  } as TextStyle,
  emptyText: {
    color: AppPalette.textSubtle,
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  } as TextStyle,
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: AppPalette.surface,
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
  } as ViewStyle,
  homeButtonText: {
    color: AppPalette.accent,
    fontSize: 15,
    fontWeight: '600',
  } as TextStyle,
});
