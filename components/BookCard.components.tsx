import React from 'react';
import { StyleSheet, Text, View, Image, TouchableOpacity, Dimensions, ViewStyle, ImageStyle, TextStyle } from 'react-native';

const { width } = Dimensions.get('window');
const COLUMN_WIDTH = (width - 60) / 2;

export interface Book {
  id: string;
  title: string;
  author: string;
  cover: string | null;
  uri: string; // Add URI for local files
}

interface BookCardProps {
  book: Book;
  onPress: () => void;
}

export const BookCard: React.FC<BookCardProps> = ({ book, onPress }) => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.coverWrapper}>
        {book.cover ? (
          <Image source={{ uri: book.cover }} style={styles.cover} resizeMode="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Text style={styles.placeholderText}>{book.title[0]}</Text>
          </View>
        )}
      </View>
      <View style={styles.textContainer}>
        <Text style={styles.title} numberOfLines={2}>{book.title}</Text>
        <Text style={styles.author}>{book.author}</Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    width: COLUMN_WIDTH,
    marginBottom: 32,
  } as ViewStyle,
  coverWrapper: {
    width: '100%',
    aspectRatio: 2/3,
    backgroundColor: '#111',
    borderRadius: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.5,
    shadowRadius: 10,
    elevation: 8,
  } as ViewStyle,
  cover: {
    flex: 1,
    borderRadius: 2,
  } as ImageStyle,
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
  } as ViewStyle,
  placeholderText: {
    color: '#333',
    fontSize: 32,
    fontWeight: '700',
  } as TextStyle,
  textContainer: {
    marginTop: 14,
  } as ViewStyle,
  title: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: '700',
    color: '#FFF',
    lineHeight: 22,
    letterSpacing: -0.2,
  } as TextStyle,
  author: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    fontWeight: '500',
  } as TextStyle,
});