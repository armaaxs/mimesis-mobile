import React from 'react';
import {
  FlatList,
  View,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
  ViewStyle,
} from 'react-native';
import { BookCard, Book } from './BookCard.components';

const { width } = Dimensions.get('window');

interface BookGridProps {
  books: Book[];
  onPress: (book: Book) => void;
  onEndReached?: () => void;
  isLoadingMore?: boolean;
  ListHeaderComponent?: React.ReactElement | null;
  ListEmptyComponent?: React.ReactElement | null;
}

export const BookGrid: React.FC<BookGridProps> = ({
  books,
  onPress,
  onEndReached,
  isLoadingMore = false,
  ListHeaderComponent,
  ListEmptyComponent,
}) => {
  const renderFooter = () => {
    if (!isLoadingMore) return null;
    return (
      <View style={styles.footerLoader}>
        <ActivityIndicator size="small" color="#00bca3" />
      </View>
    );
  };

  return (
    <FlatList
      data={books}
      keyExtractor={(item) => item.id}
      numColumns={2}
      columnWrapperStyle={styles.columnWrapper as ViewStyle}
      contentContainerStyle={styles.listPadding}
      renderItem={({ item }) => (
        <BookCard book={item} onPress={() => onPress(item)} />
      )}
      ListHeaderComponent={ListHeaderComponent}
      ListEmptyComponent={ListEmptyComponent}
      ListFooterComponent={renderFooter}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.4}
      showsVerticalScrollIndicator={false}
    />
  );
};

const styles = StyleSheet.create({
  columnWrapper: {
    justifyContent: 'space-between',
  },
  listPadding: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  footerLoader: {
    paddingVertical: 24,
    alignItems: 'center',
  },
});
