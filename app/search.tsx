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
    } catch (err) {
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
  );

  const renderHeader = () => {
    const hasSearched = activeQuery.current.trim() !== '' && !isLoading && !isLoadingMore;
    const noResults = hasSearched && books.length === 0 && !error;

    return (
      <View style={styles.resultsHeader}>
        {isLoading && books.length > 0 ? (
          // If we already have books but are running a fresh search (like changing a query mid-view)
          <View style={styles.inlineLoader}>
            <ActivityIndicator size="small" color="#00bca3" />
            <Text style={styles.inlineLoaderText}>Updating results...</Text>
          </View>
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : books.length > 0 ? (
          <Text style={styles.resultsLabel}>Results</Text>
        ) : noResults ? (
          <View style={styles.emptyContainer}>
            <Ionicons name="search-outline" size={48} color="#333" style={styles.emptyIcon} />
            <Text style={styles.emptyTitle}>No results found</Text>
            <Text style={styles.emptyText}>We couldn't find anything for "{activeQuery.current}".</Text>
            
            <TouchableOpacity 
              style={styles.homeButton} 
              activeOpacity={0.7}
              onPress={() => router.push('/')}
            >
              <Ionicons name="library-outline" size={18} color="#00bca3" style={{ marginRight: 8 }} />
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
          <Ionicons name="chevron-back" size={28} color="#fff" />
        </TouchableOpacity>
        
        <View style={styles.inputWrapper}>
          <Ionicons name="search" size={18} color="#666" style={styles.inputIcon} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Search books, authors…"
            placeholderTextColor="#666"
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
      {isLoading && books.length === 0 ? (
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
    backgroundColor: '#000',
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
    padding: 4,
    marginLeft: -4,
  } as ViewStyle,
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 44,
  } as ViewStyle,
  inputIcon: {
    marginRight: 8,
  },
  input: {
    flex: 1,
    color: '#fff',
    fontSize: 16,
    height: '100%',
  } as TextStyle,
  searchActionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 4,
  } as ViewStyle,
  searchActionText: {
    color: '#00bca3',
    fontSize: 16,
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
    color: '#00bca3',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  } as TextStyle,
  inlineLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  } as ViewStyle,
  inlineLoaderText: {
    color: '#888',
    fontSize: 13,
    fontWeight: '500',
  } as TextStyle,
  errorText: {
    color: '#e05',
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
  skeletonCard: {
    width: SKELETON_WIDTH,
    marginBottom: 24,
  } as ViewStyle,
  skeletonCover: {
    width: '100%',
    aspectRatio: 2 / 3, // Standard book cover ratio
    backgroundColor: '#111',
    borderRadius: 8,
    marginBottom: 12,
  } as ViewStyle,
  skeletonTitle: {
    width: '85%',
    height: 12,
    backgroundColor: '#111',
    borderRadius: 4,
    marginBottom: 8,
  } as ViewStyle,
  skeletonAuthor: {
    width: '60%',
    height: 10,
    backgroundColor: '#111',
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
    color: '#fff',
    fontSize: 18,
    fontWeight: '700',
    marginBottom: 8,
  } as TextStyle,
  emptyText: {
    color: '#888',
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 24,
  } as TextStyle,
  homeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: '#222',
  } as ViewStyle,
  homeButtonText: {
    color: '#00bca3',
    fontSize: 15,
    fontWeight: '600',
  } as TextStyle,
});