import React from 'react';
import { StyleSheet, Text, View, FlatList, ViewStyle, TextStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { BookCard, Book } from '../../components/BookCard.components';
import { AddBookCard } from '../../components/AddBookCard.component';

const BOOKS: Book[] = [
  { id: '1', title: 'Stoner', author: 'John Williams', cover: null , uri:''},
  { id: '2', title: 'A Little Life', author: 'Hanya Yanagihara', cover: 'https://covers.openlibrary.org/b/id/12625292-L.jpg', uri:'' },
  { id: '3', title: 'The Goldfinch', author: 'Donna Tartt', cover: 'https://covers.openlibrary.org/b/id/12068222-L.jpg', uri:'' },
  { id: '4', title: 'Normal People', author: 'Sally Rooney', cover: 'https://covers.openlibrary.org/b/id/10531551-L.jpg' , uri:''},
];

export default function LibraryScreen() {
  const router = useRouter();

  const renderHeader = () => (
    <View style={styles.header}>
      <Text style={styles.date}>Mimesis-82</Text>
      <Text style={styles.greeting}>Your Library</Text>
      <View style={styles.divider} />
    </View>
  );

  const [books, setBooks] = React.useState(BOOKS);
  const handleBookAdded = (uri: string, name: string) => {
    const newBook = {
      id: Math.random().toString(), // Generate real IDs in production
      title: name.replace('.epub', ''),
      author: 'Local Upload',
      cover: null,
      uri: uri // Pass this to your Manual Reader later
    };
    setBooks([newBook, ...books]);
  };

  const handleBookPress = (book: Book) => {
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
    backgroundColor: '#050505',
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