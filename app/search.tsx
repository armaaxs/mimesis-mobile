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
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Book } from '@/components/BookCard.components';
import { BookGrid } from '@/components/BookGrid.component';

const DEBOUNCE_MS = 400;
const GUTENDEX_BASE_URL = 'https://gutendex.com/books';

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
  console.log('[Search] Gutendex response URL:', url);
  console.log('[Search] Gutendex response JSON:', JSON.stringify(data, null, 2));
  const books = data.results.map(mapGutendexBookToCard);
  return { books, nextUrl: data.next };
};

export default function SearchScreen() {
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const activeQuery = useRef('');

  // Keep a ref for nextUrl so `runSearch` can stay stable and avoid
  // changing identity when pagination updates (which previously retriggered
  // the debounce effect even though `query` didn't change).
  const nextUrlRef = useRef<string | null>(null);

  const [query, setQuery] = useState('');
  const [books, setBooks] = useState<SearchResultBook[]>([]);
  const [nextUrl, setNextUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Auto-focus the search bar when the screen mounts
  useEffect(() => {
    const timer = setTimeout(() => {
      inputRef.current?.focus();
    }, 100);
    return () => clearTimeout(timer);
  }, []);

  const runSearch = useCallback(async (q: string, append: boolean) => {
    if (!q.trim()) {
      setBooks([]);
      setNextUrl(null);
      nextUrlRef.current = null;
      setIsLoading(false);
      setIsLoadingMore(false);
      return;
    }

    // Read the most recent nextUrl from the ref instead of closing over state.
    const requestUrl = append ? nextUrlRef.current : buildSearchUrl(q);
    if (!requestUrl) {
      return;
    }

    activeQuery.current = q;

    if (append) {
      setIsLoadingMore(true);
    } else {
      setIsLoading(true);
    }
    setError(null);

    try {
      const result = await fetchBooks(requestUrl);
      // Discard stale responses
      if (activeQuery.current !== q) return;
      setBooks((prev) => (append ? [...prev, ...result.books] : result.books));
      setNextUrl(result.nextUrl);
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

  // Debounce query changes → fresh search from page 1
  useEffect(() => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    debounceTimer.current = setTimeout(() => {
      setBooks([]);
      setNextUrl(null);
      nextUrlRef.current = null;
      void runSearch(query, false);
    }, DEBOUNCE_MS);

    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
    // Intentionally only depend on `query` so that changes to pagination
    // (nextUrl) don't re-trigger searches when the typed query hasn't changed.
  }, [query]);

  const handleEndReached = useCallback(() => {
    if (isLoadingMore || isLoading || !nextUrlRef.current || !query.trim()) return;
    void runSearch(query, true);
  }, [isLoadingMore, isLoading, query, runSearch]);

  const handleBookPress = (book: Book) => {
    const selectedBook = books.find((item) => item.id === book.id);
    if (!selectedBook) {
      return;
    }

    router.push({
      pathname: '/BookDescription',
      params: { book: JSON.stringify(selectedBook.raw) },
    });
  };

  const renderHeader = () => (
    <View style={styles.resultsHeader}>
      {isLoading ? (
        <ActivityIndicator size="small" color="#00bca3" style={styles.spinner} />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : books.length > 0 ? (
        <Text style={styles.resultsLabel}>Results</Text>
      ) : query.trim() ? (
        <Text style={styles.emptyText}>No results for "{query}"</Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      {/* Search bar row */}
      <View style={styles.searchRow}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <View style={styles.inputWrapper}>
          <Ionicons name="search" size={16} color="#666" style={styles.inputIcon} />
          <TextInput
            ref={inputRef}
            style={styles.input}
            placeholder="Search books, authors…"
            placeholderTextColor="#555"
            value={query}
            onChangeText={setQuery}
            returnKeyType="search"
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
      </View>

      {/* Book grid */}
      <BookGrid
        books={books}
        onPress={handleBookPress}
        onEndReached={handleEndReached}
        isLoadingMore={isLoadingMore}
        ListHeaderComponent={renderHeader()}
      />
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
  } as ViewStyle,
  inputWrapper: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1a1a1a',
    borderRadius: 10,
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
  } as TextStyle,
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
  } as TextStyle,
  emptyText: {
    color: '#555',
    fontSize: 14,
  } as TextStyle,
  errorText: {
    color: '#e05',
    fontSize: 14,
  } as TextStyle,
  spinner: {
    alignSelf: 'flex-start',
  },
});
