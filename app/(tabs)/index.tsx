import React from 'react';
import { StyleSheet, Text, View, FlatList, ViewStyle, TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BookCard, Book as LibraryBook } from '../../components/BookCard.components';
import { AddBookCard } from '../../components/AddBookCard.component';
import { File } from 'expo-file-system';
import JSZip from 'jszip';
import { Book } from '@/models/Book';
import { listBookCatalog, saveBook } from '@/utils/bookRepository';
import { extractEpubImportPayload } from '@/utils/epubparser';

const BOOKS: LibraryBook[] = [
  { id: '1', title: 'Stoner', author: 'John Williams', cover: null , uri:''},
  { id: '2', title: 'A Little Life', author: 'Hanya Yanagihara', cover: 'https://covers.openlibrary.org/b/id/12625292-L.jpg', uri:'' },
  { id: '3', title: 'The Goldfinch', author: 'Donna Tartt', cover: 'https://covers.openlibrary.org/b/id/12068222-L.jpg', uri:'' },
  { id: '4', title: 'Normal People', author: 'Sally Rooney', cover: 'https://covers.openlibrary.org/b/id/10531551-L.jpg' , uri:''},
];

export default function LibraryScreen() {
  const router = useRouter();
  const [books, setBooks] = React.useState<LibraryBook[]>(BOOKS);

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.date}>Mimesis-82</Text>
      <Text style={styles.greeting}>Your Library</Text>
      <View style={styles.divider} />
    </View>
  );

  React.useEffect(() => {
    const hydrateImportedBooks = async () => {
      const importedBooks = await listBookCatalog();
      setBooks([...importedBooks, ...BOOKS]);
    };

    void hydrateImportedBooks();
  }, []);

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

      const libraryBook = importedBook.toLibraryItem();
      setBooks((previousBooks) => [
        libraryBook,
        ...previousBooks.filter((book) => book.id !== libraryBook.id),
      ]);
    } catch (error) {
      console.error('Import pipeline failed:', error);
    }
  };

  const handleBookPress = (book: LibraryBook) => {
    router.push({pathname: '/reader', params: { ...book }});
  }

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
  listPadding: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  } as ViewStyle,
  columnWrapper: {
    justifyContent: 'space-between',
  },
});