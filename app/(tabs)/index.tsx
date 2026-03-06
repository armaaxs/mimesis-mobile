import React from 'react';
import { StyleSheet, Text, View, FlatList, ViewStyle, TextStyle, TouchableOpacity } from 'react-native';
// import { IconSymbol } from '../../components/ui/icon-symbol';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { BookCard, Book as LibraryBook } from '../../components/BookCard.components';
import { AddBookCard } from '../../components/AddBookCard.component';
import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { Book } from '@/models/Book';
import { reconcileFromSupabase } from '@/services/syncService';
import { deleteBook, listBookCatalog, saveBook } from '@/utils/bookRepository';
import { extractEpubImportPayload } from '@/utils/epubparser';

const BOOKS: LibraryBook[] = [
  { id: '1', title: 'Stoner', author: 'John Williams', cover: null , uri:''},
  { id: '2', title: 'A Little Life', author: 'Hanya Yanagihara', cover: 'https://covers.openlibrary.org/b/id/12625292-L.jpg', uri:'' },
  { id: '3', title: 'The Goldfinch', author: 'Donna Tartt', cover: 'https://covers.openlibrary.org/b/id/12068222-L.jpg', uri:'' },
  { id: '4', title: 'Normal People', author: 'Sally Rooney', cover: 'https://covers.openlibrary.org/b/id/10531551-L.jpg' , uri:''},
];

const dedupeBooks = (items: LibraryBook[]): LibraryBook[] => {
  const seen = new Set<string>();
  const result: LibraryBook[] = [];

  for (const book of items) {
    const uri = (book.uri || '').trim();
    const key = uri
      ? `uri:${uri}`
      : (book.id || '').trim()
        ? `id:${book.id.trim()}`
        : `meta:${book.title.trim().toLowerCase()}|${book.author.trim().toLowerCase()}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    result.push(book);
  }

  return result;
};

export default function LibraryScreen() {
  const router = useRouter();
  const [books, setBooks] = React.useState<LibraryBook[]>(BOOKS);
  const [deleteTargetBookId, setDeleteTargetBookId] = React.useState<string | null>(null);
  
  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.topRow}>  
        <Text style={styles.date}>Mimesis-82</Text>
      <TouchableOpacity
          style={styles.settingsButton}
          onPress={() => router.push('/Settings')}
          accessibilityLabel="Settings"
        >
          <Ionicons name="settings" size={28} color="#cbd5d1" />
        </TouchableOpacity>
      </View>
      <View style={styles.headingRow}>
        <Text style={styles.greeting}>Your Library</Text>

      </View>
      <View style={styles.divider} />
    </View>
  );

  useFocusEffect(
    React.useCallback(() => {
      let isActive = true;

      const hydrateImportedBooks = async () => {
        const importedBooks = await listBookCatalog();

        if (isActive) {
          setBooks(dedupeBooks([...importedBooks, ...BOOKS]));
        }

        if (importedBooks.length > 0) {
          void (async () => {
            await reconcileFromSupabase(importedBooks.map((item) => item.id));
            const reconciledBooks = await listBookCatalog();
            if (!isActive) {
              return;
            }
            setBooks(dedupeBooks([...reconciledBooks, ...BOOKS]));
          })();
        }
      };

      void hydrateImportedBooks();

      return () => {
        isActive = false;
      };
    }, [])
  );

  const handleBookAdded = async (uri: string, name: string) => {
    try {
      const file = new File(uri);
      const base64Data = await file.base64();
      const loadedZip = await JSZip.loadAsync(base64Data, { base64: true });
      const importedPayload = await extractEpubImportPayload(loadedZip);

      const importedBook = Book.fromImport({
        title: importedPayload.title || name.replace('.epub', ''),
        author: importedPayload.author || 'Local Upload',
        cover: importedPayload.cover,
        uri,
        basePath: importedPayload.basePath,
        chapters: importedPayload.chapters,
      });

      await saveBook(importedBook);
      const refreshedCatalog = await listBookCatalog();
      setBooks(dedupeBooks([...refreshedCatalog, ...BOOKS]));
    } catch (error) {
      console.error('Import pipeline failed:', error);
    }
  };

  const handleBookPress = (book: LibraryBook) => {
    if (deleteTargetBookId === book.id) {
      setDeleteTargetBookId(null);
      return;
    }

    const bookWithMetadata = book as LibraryBook & {
      metadata?: {
        summary: string | null;
        downloadCount: number | null;
        language: string | null;
        subjects: string[];
        sourceId: number | null;
      } | null;
      readingProgress?: {
        lastChapterIndex: number;
        lastChunkIndex: number;
        lastChapterHref: string | null;
        lastReadAt: number;
      } | null;
    };

    // Open description page which will resolve transient DTOs or persisted books
    router.push({
      pathname: '/BookDescription',
      params: {
        bookId: book.id,
        metadata: bookWithMetadata.metadata
          ? JSON.stringify(bookWithMetadata.metadata)
          : undefined,
        progress: bookWithMetadata.readingProgress
          ? JSON.stringify(bookWithMetadata.readingProgress)
          : undefined,
      },
    });
  };

  const handleDeleteBook = async (book: LibraryBook) => {
    setDeleteTargetBookId(null);
    setBooks((previousBooks) => previousBooks.filter((item) => item.id !== book.id));

    try {
      await deleteBook(book.id);
      const refreshed = await listBookCatalog();
      setBooks(dedupeBooks([...refreshed, ...BOOKS]));
    } catch (error) {
      console.warn('Failed to delete book:', error);
      const restored = await listBookCatalog();
      setBooks(dedupeBooks([...restored, ...BOOKS]));
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <FlatList
        data={books}
        ListHeaderComponent={
          <>
        {renderHeader()}
        <AddBookCard onBookAdded={handleBookAdded} />
          </>
        }
        renderItem={({ item }) => (
          <BookCard 
            book={item}
            onPress={() => handleBookPress(item)}
            onLongPress={() => {
              if (!item.uri) {
                return;
              }
              setDeleteTargetBookId(item.id);
            }}
            showDeleteAction={Boolean(item.uri) && deleteTargetBookId === item.id}
            onDeletePress={() => handleDeleteBook(item)}
          />
        )}
        keyExtractor={(item) => item.id}
        numColumns={2}
        columnWrapperStyle={styles.columnWrapper as ViewStyle}
        contentContainerStyle={styles.listPadding}
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  } as ViewStyle,
  header: {
    marginTop: 20,
    marginBottom: 30,
    paddingHorizontal: 4,
  } as ViewStyle,
  date: {
    fontSize: 11,
    fontWeight: '800',
    color: '#00bca3',
    letterSpacing: 1.5,
  } as TextStyle,
  greeting: {
    fontFamily: 'Georgia', // Native fallback for Charter
    fontSize: 48,
    fontWeight: '700',
    color: '#ffffff',
    marginTop: 8,
    letterSpacing: -1.5,
  } as TextStyle,
  divider: {
    height: 1,
    backgroundColor: '#2f2f2f',
    marginTop: 24,
    width: '100%',
  } as ViewStyle,
  headingRow: {
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  } as ViewStyle,
    topRow: {
    marginTop: 8,
    flexDirection: 'row',
      alignItems: 'flex-end',
    justifyContent: 'space-between',
  } as ViewStyle,
  settingsButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
  } as ViewStyle,
  // settingsText removed, replaced by icon
  listPadding: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  } as ViewStyle,
  columnWrapper: {
    justifyContent: 'space-between',
  },
});