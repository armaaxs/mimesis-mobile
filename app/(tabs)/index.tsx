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
import { AppPalette } from '@/constants/theme';

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
  const [books, setBooks] = React.useState<LibraryBook[]>([]);
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
          <Ionicons name="settings" size={24} color={AppPalette.accentStrong} />
        </TouchableOpacity>
      </View>
      <View style={styles.headingRow}>
        <Text style={styles.greeting}>Your Library</Text>
      </View>
      <View style={styles.libraryGraphic}>
        <View style={styles.libraryGraphicShelf}>
          <View style={[styles.libraryGraphicBook, styles.libraryGraphicBookTall]} />
          <View style={[styles.libraryGraphicBook, styles.libraryGraphicBookAccent]} />
          <View style={[styles.libraryGraphicBook, styles.libraryGraphicBookWide]} />
          <View style={styles.libraryGraphicMedallion}>
            <Ionicons name="bookmark-outline" size={18} color={AppPalette.surface} />
          </View>
        </View>
        <Text style={styles.libraryGraphicCaption}>A quieter shelf for the books you keep close.</Text>
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
          setBooks(dedupeBooks(importedBooks));
        }

        if (importedBooks.length > 0) {
          void (async () => {
            await reconcileFromSupabase(importedBooks.map((item) => item.id));
            const reconciledBooks = await listBookCatalog();
            if (!isActive) {
              return;
            }
            setBooks(dedupeBooks(reconciledBooks));
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
      setBooks(dedupeBooks(refreshedCatalog));
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
      setBooks(dedupeBooks(refreshed));
    } catch (error) {
      console.warn('Failed to delete book:', error);
      const restored = await listBookCatalog();
      setBooks(dedupeBooks(restored));
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
    backgroundColor: AppPalette.background,
  } as ViewStyle,
  header: {
    marginTop: 10,
    marginBottom: 28,
    paddingHorizontal: 4,
  } as ViewStyle,
  date: {
    fontSize: 12,
    fontWeight: '800',
    color: AppPalette.accent,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
  } as TextStyle,
  greeting: {
    fontFamily: 'Georgia', // Native fallback for Charter
    fontSize: 44,
    fontWeight: '700',
    color: AppPalette.text,
    marginTop: 10,
    letterSpacing: -1.2,
  } as TextStyle,
  divider: {
    height: 1,
    backgroundColor: AppPalette.border,
    marginTop: 22,
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
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 16,
    backgroundColor: AppPalette.surface,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 2,
  } as ViewStyle,
  libraryGraphic: {
    marginTop: 22,
    backgroundColor: AppPalette.surface,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.24)',
    paddingHorizontal: 18,
    paddingVertical: 18,
  } as ViewStyle,
  libraryGraphicShelf: {
    minHeight: 96,
    borderRadius: 18,
    backgroundColor: AppPalette.surfaceStrong,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    paddingHorizontal: 18,
    paddingBottom: 18,
  } as ViewStyle,
  libraryGraphicBook: {
    position: 'absolute',
    bottom: 18,
    width: 28,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.22)',
    backgroundColor: AppPalette.background,
  } as ViewStyle,
  libraryGraphicBookTall: {
    left: 22,
    height: 58,
  } as ViewStyle,
  libraryGraphicBookAccent: {
    left: 58,
    height: 72,
    backgroundColor: AppPalette.accentSoft,
  } as ViewStyle,
  libraryGraphicBookWide: {
    left: 94,
    width: 34,
    height: 48,
  } as ViewStyle,
  libraryGraphicMedallion: {
    position: 'absolute',
    right: 20,
    top: 18,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: AppPalette.accent,
    alignItems: 'center',
    justifyContent: 'center',
  } as ViewStyle,
  libraryGraphicCaption: {
    marginTop: 12,
    color: AppPalette.textMuted,
    fontSize: 14,
    lineHeight: 21,
  } as TextStyle,
  // settingsText removed, replaced by icon
  listPadding: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  } as ViewStyle,
  columnWrapper: {
    justifyContent: 'space-between',
  },
});
