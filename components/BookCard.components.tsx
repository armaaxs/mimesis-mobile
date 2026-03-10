import React from 'react';
import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, Text, View, Image, TouchableOpacity, Dimensions, ViewStyle, ImageStyle, TextStyle } from 'react-native';
import { AppPalette } from '@/constants/theme';

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
  onLongPress?: () => void;
  showDeleteAction?: boolean;
  onDeletePress?: () => void;
}

export const BookCard: React.FC<BookCardProps> = ({
  book,
  onPress,
  onLongPress,
  showDeleteAction,
  onDeletePress,
}) => {
  return (
    <TouchableOpacity style={styles.container} onPress={onPress} onLongPress={onLongPress} activeOpacity={0.7}>
      <View style={styles.coverWrapper}>
        {showDeleteAction && onDeletePress ? (
          <TouchableOpacity style={styles.deleteButton} onPress={onDeletePress} activeOpacity={0.85}>
            <Ionicons name="trash" size={16} color="#fff" />
          </TouchableOpacity>
        ) : null}
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
    backgroundColor: AppPalette.surfaceStrong,
    borderRadius: 18,
    position: 'relative',
    shadowColor: AppPalette.shadow,
    shadowOffset: { width: 0, height: 14 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 7,
    borderWidth: 1,
    borderColor: 'rgba(180, 157, 123, 0.28)',
  } as ViewStyle,
  cover: {
    flex: 1,
    borderRadius: 18,
  } as ImageStyle,
  deleteButton: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 3,
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: AppPalette.danger,
  } as ViewStyle,
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: AppPalette.surfaceStrong,
  } as ViewStyle,
  placeholderText: {
    color: AppPalette.borderStrong,
    fontSize: 40,
    fontWeight: '700',
  } as TextStyle,
  textContainer: {
    marginTop: 16,
    paddingHorizontal: 2,
  } as ViewStyle,
  title: {
    fontFamily: 'Georgia',
    fontSize: 18,
    fontWeight: '700',
    color: AppPalette.text,
    lineHeight: 24,
    letterSpacing: -0.2,
  } as TextStyle,
  author: {
    fontSize: 12,
    color: AppPalette.textSubtle,
    marginTop: 6,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    fontWeight: '600',
  } as TextStyle,
});
